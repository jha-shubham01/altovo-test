// The ONLY module that talks HTTP. Every network call in the app goes through
// here — including the hand-rolled SSE-over-fetch parser for /api/ask (CLAUDE.md
// hard rule: no other file calls `fetch`).

import type {
  AskEvent,
  Citation,
  DocumentRecord,
  FileUrlResponse,
  FromUrlResponse,
  HighlightResponse,
  RetrievedSource,
  SignUploadResponse,
} from "./types";

// Empty base ⇒ same-origin; the Vercel rewrite (or local next.config rewrite)
// routes /api/* to FastAPI. Never hard-code a host here.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

// --- Typed error --------------------------------------------------------------

// Single wire error shape: {error: {code, message}} (PLAN §2). We surface it as
// a real Error subclass so callers can `catch` and narrow with isApiError().
export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

// Read a human-facing message off any thrown value.
export function errorMessage(err: unknown): string {
  if (isApiError(err)) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

// --- Low-level helpers --------------------------------------------------------

interface WireError {
  error?: { code?: unknown; message?: unknown };
}

function isWireError(value: unknown): value is Required<WireError> {
  if (typeof value !== "object" || value === null) return false;
  const err = (value as WireError).error;
  return typeof err === "object" && err !== null;
}

// Turn a non-2xx response into an ApiError, best-effort decoding the wire shape.
async function toApiError(res: Response): Promise<ApiError> {
  let code = `http_${res.status}`;
  let message = res.statusText || "Request failed.";
  try {
    const body: unknown = await res.json();
    if (isWireError(body)) {
      const e = body.error;
      if (typeof e.code === "string") code = e.code;
      if (typeof e.message === "string") message = e.message;
    }
  } catch {
    // Non-JSON error body — keep the status-derived defaults.
  }
  return new ApiError(code, message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("network_error", "Could not reach the server.");
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

// --- Documents ----------------------------------------------------------------

export function listDocuments(): Promise<DocumentRecord[]> {
  return request<DocumentRecord[]>("/api/documents");
}

export interface SignUploadArgs {
  filename: string;
  size: number;
  mime: string;
}

export function signUpload(args: SignUploadArgs): Promise<SignUploadResponse> {
  return request<SignUploadResponse>("/api/documents/sign-upload", {
    method: "POST",
    body: jsonBody(args),
  });
}

// The ONE allowed direct fetch to a non-/api origin: the browser PUTs the file
// straight to the Supabase Storage signed URL, bypassing Vercel's 4.5 MB body
// limit (PLAN §2). Kept inside api.ts so the "all HTTP here" rule still holds.
export async function uploadToStorage(
  uploadUrl: string,
  token: string,
  file: File,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
  } catch {
    throw new ApiError("upload_failed", "Could not upload the file to storage.");
  }
  if (!res.ok) {
    throw new ApiError(
      "upload_failed",
      `Storage upload failed (${res.status}).`,
    );
  }
}

export interface IngestArgs {
  path: string;
  filename: string;
}

export function ingestDocument(args: IngestArgs): Promise<DocumentRecord> {
  return request<DocumentRecord>("/api/documents/ingest", {
    method: "POST",
    body: jsonBody(args),
  });
}

// Convenience orchestration of the three-step upload flow used by both the
// dropzone and the "load sample document" button. Kept here so every HTTP call
// stays inside api.ts. Optional `onStage` reports progress for per-file UI.
export type UploadStage = "signing" | "uploading" | "ingesting";

export async function uploadAndIngest(
  file: File,
  onStage?: (stage: UploadStage) => void,
): Promise<DocumentRecord> {
  onStage?.("signing");
  const signed = await signUpload({
    filename: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
  });
  onStage?.("uploading");
  await uploadToStorage(signed.upload_url, signed.token, file);
  onStage?.("ingesting");
  return ingestDocument({ path: signed.path, filename: file.name });
}

export function deleteDocument(id: string): Promise<void> {
  return request<void>(`/api/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// Fetch a bundled static asset (e.g. the sample document in /public) and wrap
// it as a File so it can run through the normal upload flow (D14). Kept here so
// page/components never call `fetch` directly (CLAUDE.md hard rule).
export async function fetchLocalFile(path: string, filename: string, mime: string): Promise<File> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    throw new ApiError("sample_unavailable", "Sample document is unavailable.");
  }
  if (!res.ok) {
    throw new ApiError("sample_unavailable", "Sample document is unavailable.");
  }
  const blob = await res.blob();
  return new File([blob], filename, { type: mime });
}

export function fromUrl(url: string): Promise<FromUrlResponse> {
  return request<FromUrlResponse>("/api/documents/from-url", {
    method: "POST",
    body: jsonBody({ url }),
  });
}

export function resetWorkspace(): Promise<void> {
  return request<void>("/api/reset", { method: "POST" });
}

// --- Stretch endpoints (Phase 6) ---------------------------------------------

export function getFileUrl(id: string): Promise<FileUrlResponse> {
  return request<FileUrlResponse>(
    `/api/documents/${encodeURIComponent(id)}/file`,
  );
}

export function getHighlight(
  id: string,
  chunkId: number,
): Promise<HighlightResponse> {
  const q = new URLSearchParams({ chunk_id: String(chunkId) });
  return request<HighlightResponse>(
    `/api/documents/${encodeURIComponent(id)}/highlight?${q.toString()}`,
  );
}

// --- Ask (SSE over fetch) -----------------------------------------------------

export interface AskHandlers {
  onSources: (
    sources: RetrievedSource[],
    flags: { weakMatch: boolean; notFound: boolean },
  ) => void;
  onDelta: (text: string) => void;
  onCitations: (citations: Citation[]) => void;
  onDone: () => void;
  onError: (err: { code: string; message: string }) => void;
}

export interface AskArgs {
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
}

// Parse one decoded `data:`-payload frame and dispatch the typed callback.
// Unknown event types are ignored so a forward-compatible backend never breaks
// the stream.
function dispatchEvent(evt: AskEvent, handlers: AskHandlers): void {
  switch (evt.type) {
    case "sources":
      handlers.onSources(evt.sources, {
        weakMatch: evt.weak_match,
        notFound: evt.not_found,
      });
      return;
    case "delta":
      handlers.onDelta(evt.text);
      return;
    case "citations":
      handlers.onCitations(evt.citations);
      return;
    case "done":
      handlers.onDone();
      return;
    case "error":
      handlers.onError({ code: evt.code, message: evt.message });
      return;
    default:
      return;
  }
}

// Extract the concatenated `data:` lines from one SSE frame (already split on
// the blank-line boundary). Comment lines (starting `:`) and other fields are
// ignored per the SSE spec.
function parseFrame(frame: string): string | null {
  const dataLines: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}

// POST /api/ask and stream the SSE response. POST rules out EventSource, so we
// read the ReadableStream by hand: decode chunks, buffer across chunk
// boundaries, and only parse a frame once its terminating blank line has
// arrived. Aborting via `signal` cancels the fetch and resolves quietly.
export async function ask(
  args: AskArgs,
  handlers: AskHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: jsonBody(args),
      signal,
    });
  } catch (err) {
    if (isAbort(err)) return;
    handlers.onError({
      code: "network_error",
      message: "Could not reach the server.",
    });
    return;
  }

  if (!res.ok) {
    const apiErr = await toApiError(res);
    handlers.onError({ code: apiErr.code, message: apiErr.message });
    return;
  }

  if (!res.body) {
    handlers.onError({
      code: "no_stream",
      message: "The server returned an empty response.",
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushFrame = (frame: string): void => {
    const payload = parseFrame(frame);
    if (payload === null) return;
    let evt: AskEvent;
    try {
      evt = JSON.parse(payload) as AskEvent;
    } catch {
      // A malformed frame shouldn't tear down the whole stream.
      return;
    }
    dispatchEvent(evt, handlers);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Normalise CRLF → LF so the blank-line frame boundary is always "\n\n",
      // even if an intermediary rewrote line endings.
      buffer = buffer.replace(/\r\n/g, "\n");

      // Frames are separated by a blank line. Everything up to the last
      // separator is complete; the tail is a partial frame held for the next
      // chunk.
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        flushFrame(frame);
        sep = buffer.indexOf("\n\n");
      }
    }
    // Flush any trailing frame that wasn't blank-line terminated.
    buffer += decoder.decode();
    if (buffer.trim().length > 0) flushFrame(buffer);
  } catch (err) {
    if (isAbort(err)) return;
    handlers.onError({
      code: "stream_error",
      message: "The connection was interrupted.",
    });
  } finally {
    reader.releaseLock();
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
