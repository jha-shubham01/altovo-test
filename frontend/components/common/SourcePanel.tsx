import type { RetrievedSource } from "@/lib/types";
import { cn } from "@/lib/cn";
import { EmptyState, IconButton, DocsIcon, ExternalIcon } from "@/components/atoms";

// Display thresholds for the relevance band. Gemini cosine similarities cluster
// high (D10), so these are tuned for that distribution — they are a user-facing
// trust affordance, not the retrieval gate (the server owns SIM_FLOOR).
const STRONG = 0.75;
const MEDIUM = 0.6;

type Band = "strong" | "medium" | "weak";

function bandFor(similarity: number): Band {
  if (similarity >= STRONG) return "strong";
  if (similarity >= MEDIUM) return "medium";
  return "weak";
}

const BAND_META: Record<Band, { bar: string; text: string; label: string }> = {
  strong: {
    bar: "bg-relevance-strong",
    text: "text-relevance-strong",
    label: "Strong match",
  },
  medium: {
    bar: "bg-relevance-medium",
    text: "text-relevance-medium",
    label: "Medium match",
  },
  weak: {
    bar: "bg-relevance-weak",
    text: "text-relevance-weak",
    label: "Weak match",
  },
};

export interface SourcePanelProps {
  sources: RetrievedSource[];
  // The chunk currently focused (e.g. after a citation-chip click).
  activeChunkId?: number | null;
  // Jump to / open the source (highlight fallback ladder ends here, D11).
  onJump?: (source: RetrievedSource) => void;
  // Retrieval in flight (question sent, sources not back yet) → show skeleton.
  loading?: boolean;
  // Chunk ids the answer actually cited — shown first, badged. The rest are
  // "also checked" context passages, rendered dimmed.
  citedChunkIds?: number[];
  // Cap on rendered passages (cited ones always make the cut).
  limit?: number;
}

// Presentational. Renders each retrieved source with a relevance band and a
// jump action, sorted by fused retrieval score.
export function SourcePanel({
  sources,
  activeChunkId,
  onJump,
  loading,
  citedChunkIds,
  limit,
}: SourcePanelProps) {
  if (sources.length === 0 && loading) {
    return (
      <ul className="space-y-2.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="animate-pulse overflow-hidden rounded-lg border border-navy-100 bg-surface"
          >
            <div className="flex">
              <div className="w-1 shrink-0 bg-navy-100" />
              <div className="min-w-0 flex-1 space-y-2 p-3">
                <div className="h-3 w-2/3 rounded bg-navy-100" />
                <div className="h-2 w-1/3 rounded bg-navy-50" />
                <div className="h-2 w-full rounded bg-navy-50" />
                <div className="h-2 w-5/6 rounded bg-navy-50" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (sources.length === 0) {
    return (
      <EmptyState
        icon={<DocsIcon width={24} height={24} />}
        title="No sources yet"
        copy="Ask a question and the passages used to answer it will appear here."
      />
    );
  }

  // Cited passages first (they ARE the answer's sources), the rest by fused
  // score as "also checked" context; cap the list so it never reads as noise.
  const cited = new Set(citedChunkIds ?? []);
  const sorted = [...sources].sort((a, b) => {
    const ac = cited.has(a.chunk_id) ? 1 : 0;
    const bc = cited.has(b.chunk_id) ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return b.rrf_score - a.rrf_score;
  });
  const shown = limit ? sorted.slice(0, Math.max(limit, cited.size)) : sorted;
  const hiddenCount = sorted.length - shown.length;
  const hasCited = cited.size > 0;

  return (
    <ul className="space-y-2.5">
      {shown.map((s) => {
        const isCited = cited.has(s.chunk_id);
        const band = bandFor(s.similarity);
        const meta = BAND_META[band];
        const locator = s.page
          ? `p. ${s.page}`
          : s.section
            ? s.section
            : `chunk ${s.n}`;
        const active = activeChunkId === s.chunk_id;

        return (
          <li
            key={s.chunk_id}
            id={`source-${s.chunk_id}`}
            className={cn(
              "overflow-hidden rounded-lg border bg-surface",
              active ? "border-accent ring-1 ring-accent" : "border-navy-100",
              // When the answer cites specific passages, de-emphasise the rest.
              hasCited && !isCited && !active && "opacity-55",
            )}
          >
            <div className="flex">
              <div
                className={cn("w-1 shrink-0", meta.bar)}
                aria-hidden
              />
              <div className="min-w-0 flex-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[12px] font-medium text-navy-900">
                      <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-navy-50 px-1 text-[11px] font-semibold text-navy-500">
                        {s.n}
                      </span>
                      <span className="truncate" title={s.filename}>
                        {s.filename}
                      </span>
                      {isCited ? (
                        <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                          Cited
                        </span>
                      ) : hasCited ? (
                        <span className="shrink-0 rounded-full bg-navy-50 px-1.5 py-0.5 text-[10px] font-medium text-navy-400">
                          Checked
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-navy-400">
                      {locator}
                      <span className={cn("ml-2 font-medium", meta.text)}>
                        {meta.label} · {(s.similarity * 100).toFixed(0)}%
                      </span>
                    </p>
                  </div>
                  {onJump ? (
                    <IconButton
                      label={`Open source ${s.n}`}
                      size="sm"
                      onClick={() => onJump(s)}
                      className="shrink-0"
                    >
                      <ExternalIcon width={15} height={15} />
                    </IconButton>
                  ) : null}
                </div>
                <p className="mt-2 line-clamp-4 text-[12px] leading-relaxed text-navy-600">
                  {s.snippet}
                </p>
              </div>
            </div>
          </li>
        );
      })}
      {hiddenCount > 0 ? (
        <li className="px-1 text-center text-[11px] text-navy-400">
          {hiddenCount} more passage{hiddenCount === 1 ? "" : "s"} checked but
          not shown
        </li>
      ) : null}
    </ul>
  );
}
