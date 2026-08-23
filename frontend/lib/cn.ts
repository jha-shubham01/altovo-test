// Tiny className joiner — filters falsy values. Avoids a dependency for a
// one-liner. Not HTTP, so it belongs outside api.ts.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
