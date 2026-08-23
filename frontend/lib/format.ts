// Presentational formatting helpers (no HTTP, no state).

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

// Short type label from a mime type / filename.
export function docTypeLabel(mime: string, filename: string): string {
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("wordprocessingml") || filename.endsWith(".docx")) {
    return "DOCX";
  }
  if (mime.includes("markdown") || filename.endsWith(".md")) return "MD";
  if (mime.includes("text") || filename.endsWith(".txt")) return "TXT";
  const ext = filename.split(".").pop();
  return ext ? ext.toUpperCase().slice(0, 4) : "DOC";
}
