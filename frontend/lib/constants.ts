// Client-side upload guardrails. These mirror the backend's advisory sign-time
// checks (security-baseline.md); the server re-validates authoritatively.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB (D18)

// Allowlist by extension — more reliable than browser MIME for md/txt.
export const ALLOWED_EXTENSIONS = ["pdf", "txt", "md", "docx"] as const;

// `accept` attribute for the file picker.
export const FILE_ACCEPT =
  ".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Bundled sample document, served from the public dir and run through the
// normal upload flow (D14). The file is expected to exist at build/deploy time.
export const SAMPLE_DOC_PATH = "/samples/sample-altovo-handbook.pdf";

// D13: send at most the last 6 turns as generation history.
export const MAX_HISTORY_TURNS = 6;

// Retrieval hands the model 8 passages for recall, but showing all of them
// reads as noise — the panel displays at most this many (cited ones first).
export const SOURCE_DISPLAY_LIMIT = 5;

function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

// Returns a human-facing error string, or null if the file passes the
// client-side pre-check.
export function validateUploadFile(file: File): string | null {
  const ext = extensionOf(file.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Unsupported type — allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File is larger than the 15 MB limit.";
  }
  if (file.size === 0) {
    return "File is empty.";
  }
  return null;
}
