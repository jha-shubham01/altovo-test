# Security baseline

## Upload / ingest
- **Type allowlist:** `pdf`, `txt`, `md`, `docx` only (by MIME + extension).
- **Size cap:** 15 MB. **Page cap:** 80 pages (PDF). Reject over-cap with a
  clear, user-facing message — never silently truncate.
- **Magic-byte re-validation at ingest.** Sign-time checks (`/sign-upload`) are
  advisory; the stored object is re-validated on `/ingest` before parsing
  (content-type from the client cannot be trusted).
- **Filenames sanitised** — strip path separators and control chars; storage
  paths are uuid-prefixed so a hostile filename can't traverse or collide.

## URL data source (SSRF guard)
- Resolve the host; **block private / loopback / link-local / metadata IP
  ranges** (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7).
- **Block redirects to private IPs** (re-check after each hop; cap hops).
- Enforce the same size cap on download; stream with a hard byte ceiling.
- HTML extraction is scoped: same-domain linked docs only, capped at 10, no
  recursive crawl.

## Content handling
- **Document + retrieved chunk text is untrusted data**, never instructions.
  It is placed in the model context as quoted passages; the system prompt is
  the only source of instructions.
- Never log full document contents or API keys.

## Secrets
- Service-role Supabase key and Gemini key are server-side only; never sent to
  the browser and never placed in `NEXT_PUBLIC_*`.
- `.env` is developer-owned (D17); not committed, not read by the assistant.
