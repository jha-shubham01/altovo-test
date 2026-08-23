import type { ReactNode } from "react";
import type {
  ChatMessage as ChatMessageModel,
  Citation,
  RetrievedSource,
} from "@/lib/types";
import { cn } from "@/lib/cn";
import { CitationChip, AlertIcon } from "@/components/atoms";

export interface ChatMessageProps {
  message: ChatMessageModel;
  // Click a citation chip → focus that source in the SourcePanel. The messageId
  // lets the panel switch to this answer's sources (works for earlier turns).
  onCitationClick?: (messageId: string, chunkId: number) => void;
}

// Splits assistant text on [n] markers and renders each marker as a
// CitationChip. During streaming (no validated citations yet) chips are
// provisional; once the `citations` event lands, chips validate or get struck
// through if the model cited an id that wasn't in the retrieved set (D9).
function renderWithCitations(
  messageId: string,
  text: string,
  sources: RetrievedSource[] | undefined,
  citations: Citation[] | undefined,
  streaming: boolean,
  onCitationClick?: (messageId: string, chunkId: number) => void,
): ReactNode[] {
  const sourceByN = new Map<number, RetrievedSource>();
  for (const s of sources ?? []) sourceByN.set(s.n, s);
  const validatedByN = new Map<number, Citation>();
  for (const c of citations ?? []) validatedByN.set(c.n, c);
  const reconciled = citations !== undefined;

  const parts: ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    const full = match[0];
    const numStr = match[1];
    if (numStr === undefined) continue;
    const n = Number(numStr);

    if (match.index > last) {
      parts.push(<span key={`t-${key++}`}>{text.slice(last, match.index)}</span>);
    }
    last = match.index + full.length;

    const source = sourceByN.get(n);
    // Before reconciliation every chip is provisional. After, a chip is valid
    // only if it survived server-side validation.
    const valid = reconciled ? validatedByN.has(n) : true;
    const label = source
      ? `${source.filename}${
          source.page ? `, p.${source.page}` : source.section ? `, ${source.section}` : ""
        }`
      : `Source ${n}`;

    parts.push(
      <CitationChip
        key={`c-${key++}`}
        n={n}
        provisional={!reconciled}
        valid={valid}
        label={label}
        onClick={
          valid && source
            ? () => onCitationClick?.(messageId, source.chunk_id)
            : undefined
        }
      />,
    );
  }

  if (last < text.length) {
    parts.push(<span key={`t-${key++}`}>{text.slice(last)}</span>);
  }

  if (streaming) {
    parts.push(
      <span
        key="cursor"
        className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-navy-400 align-baseline"
        aria-hidden
      />,
    );
  }

  return parts;
}

// Shown in the assistant bubble before any answer text streams in. Phased:
// "searching" until the sources arrive, then "writing" while the model composes.
function StreamingIndicator({ hasSources }: { hasSources: boolean }) {
  return (
    <span className="flex items-center gap-2 text-navy-400" aria-live="polite">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      <span className="text-[13px]">
        {hasSources ? "Reading the sources…" : "Searching your documents…"}
      </span>
    </span>
  );
}

export function ChatMessage({ message, onCitationClick }: ChatMessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-navy-900 px-3.5 py-2.5 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant.
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "max-w-[90%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
          message.notFound
            ? "border border-navy-100 bg-navy-50 text-navy-500 italic"
            : "bg-surface text-navy-800 shadow-card",
        )}
      >
        {message.error ? (
          <div className="flex items-start gap-2 text-relevance-weak">
            <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
            <span>{message.error}</span>
          </div>
        ) : (
          <>
            {message.weakMatch && !message.notFound ? (
              <div className="mb-2 flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[12px] text-relevance-medium">
                <AlertIcon width={14} height={14} className="mt-0.5 shrink-0" />
                <span>
                  {message.citations !== undefined && message.citations.length === 0
                    ? "Weak match — the documents only loosely relate to this question."
                    : "Weak match — the documents only loosely cover this. Verify against the sources."}
                </span>
              </div>
            ) : null}
            <div className="whitespace-pre-wrap">
              {message.content.length > 0 ? (
                renderWithCitations(
                  message.id,
                  message.content,
                  message.sources,
                  message.citations,
                  Boolean(message.streaming),
                  onCitationClick,
                )
              ) : message.streaming ? (
                <StreamingIndicator hasSources={Boolean(message.sources?.length)} />
              ) : (
                <span className="text-navy-400">…</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
