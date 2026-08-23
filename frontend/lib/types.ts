// Mirrors api/models.py. Keep in sync by hand — the two are the wire contract.

export type DocumentStatus = "processing" | "ready" | "failed";
export type SourceType = "upload" | "url";
export type Role = "user" | "assistant";

export interface DocumentRecord {
  id: string;
  filename: string;
  source_type: SourceType;
  source_url: string | null;
  storage_path: string | null;
  mime_type: string;
  size_bytes: number | null;
  page_count: number | null;
  status: DocumentStatus;
  error: string | null;
  created_at: string;
}

export interface SignUploadResponse {
  path: string;
  upload_url: string;
  token: string;
}

export interface LinkedDocCandidate {
  url: string;
  label: string;
}

export interface FromUrlResponse {
  document?: DocumentRecord | null;
  candidates?: LinkedDocCandidate[] | null;
}

export interface ChatTurn {
  role: Role;
  content: string;
}

// SSE `sources` event payload (one per retrieved chunk).
export interface RetrievedSource {
  n: number;
  chunk_id: number;
  document_id: string;
  filename: string;
  page: number | null;
  section: string | null;
  snippet: string;
  similarity: number;
  rrf_score: number;
}

// SSE `citations` event payload (validated [n] -> chunk map).
export interface Citation {
  n: number;
  chunk_id: number;
  document_id: string;
  filename: string;
  page: number | null;
  section: string | null;
}

// --- SSE event envelope (see §2 of PLAN.md) ---
// sources -> delta* -> citations -> done  |  error
export type AskEvent =
  | { type: "sources"; sources: RetrievedSource[]; weak_match: boolean; not_found: boolean }
  | { type: "delta"; text: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

// --- Highlight (stretch, Phase 6) ---
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HighlightResponse {
  page: number | null;
  page_w: number | null;
  page_h: number | null;
  rects: Rect[];
}

export interface FileUrlResponse {
  url: string;
}

// --- Client-side view models ---
export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  sources?: RetrievedSource[];
  citations?: Citation[];
  weakMatch?: boolean;
  notFound?: boolean;
  streaming?: boolean;
  error?: string;
}

export interface ApiError {
  code: string;
  message: string;
}
