"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { SOURCE_DISPLAY_LIMIT } from "@/lib/constants";
import type { RetrievedSource } from "@/lib/types";
import { ChatMessage } from "@/components/common/ChatMessage";
import { ChatInput } from "@/components/common/ChatInput";
import { SourcePanel } from "@/components/common/SourcePanel";
import type { PdfViewerSource } from "@/components/common/PdfViewer";
import { Button, ChatIcon, DocsIcon, SparkIcon } from "@/components/atoms";

// Client-only: react-pdf can't render during SSR.
const PdfViewer = dynamic(
  () => import("@/components/common/PdfViewer").then((m) => m.PdfViewer),
  { ssr: false },
);

// Starter chips, drawn from test-docs/QUESTIONS.md — each exercises a distinct
// behavior against the bundled corpus: grounded citation, exact-token (FTS)
// retrieval, cross-document conflict (D19), ambiguity (D19), the not-in-docs
// refusal (D10), and an answerable negative.
const SUGGESTIONS = [
  "How many PTO days per year?",
  "What does policy HR-204 cover?",
  "How often are company laptops replaced?",
  "How many days do I get?",
  "What's the parental-leave policy?",
  "Is Safari supported?",
];

export default function AskPage() {
  const {
    messages,
    streaming,
    canAsk,
    askQuestion,
    stop,
    activeSources,
    activeNoneCited,
    activeCitedChunkIds,
    activeChunkId,
    onCitationClick,
  } = useApp();

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Source opened in the PDF viewer modal (null = closed).
  const [viewerSource, setViewerSource] = useState<PdfViewerSource | null>(null);
  const openSource = (s: RetrievedSource) => {
    setViewerSource({
      documentId: s.document_id,
      filename: s.filename,
      chunkId: s.chunk_id,
      page: s.page,
      snippet: s.snippet,
    });
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6 lg:grid lg:h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Chat */}
      <section className="flex h-[65vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-navy-100 bg-surface shadow-card lg:h-auto">
        <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {!canAsk && messages.length === 0 ? (
            <NoDocsPrompt />
          ) : messages.length === 0 ? (
            <WelcomePrompt onPick={askQuestion} />
          ) : (
            messages.map((m) => (
              <ChatMessage key={m.id} message={m} onCitationClick={onCitationClick} />
            ))
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t border-navy-100 bg-canvas/60 p-3">
          <ChatInput
            onSend={askQuestion}
            onStop={stop}
            streaming={streaming}
            disabled={!canAsk && !streaming}
            placeholder={
              canAsk
                ? "Ask a question about your documents…"
                : "Add a ready document first"
            }
          />
        </div>
      </section>

      {/* Sources — stacks below the chat on mobile, side column on lg+ */}
      <aside className="flex max-h-[70vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-navy-100 bg-surface shadow-card lg:max-h-none">
        <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-400">
            Sources
          </h2>
          {!streaming && activeCitedChunkIds.length > 0 ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
              {activeCitedChunkIds.length} cited
            </span>
          ) : null}
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          {streaming ? (
            // Answer first: while it streams, the panel holds a skeleton — the
            // retrieved passages only appear once the answer (and its validated
            // citations) are in, so a refusal never flashes sources it then
            // hides.
            <SourcePanel sources={[]} loading />
          ) : activeNoneCited ? (
            // The answer cited nothing (a grounded refusal) — showing the
            // checked-but-unused passages reads as a contradiction, so hide
            // them and say why the panel is empty.
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-navy-200 px-4 py-8 text-center">
              <SparkIcon width={20} height={20} className="text-navy-300" />
              <p className="text-[13px] font-medium text-navy-700">No sources used</p>
              <p className="max-w-[240px] text-[12px] leading-relaxed text-navy-400">
                The documents were searched, but nothing in them answers this
                question.
              </p>
            </div>
          ) : (
            <SourcePanel
              sources={activeSources}
              activeChunkId={activeChunkId}
              onJump={(s) => openSource(s)}
              citedChunkIds={activeCitedChunkIds}
              limit={SOURCE_DISPLAY_LIMIT}
            />
          )}
        </div>
      </aside>

      {/* PDF viewer modal (client-only) */}
      <PdfViewer source={viewerSource} onClose={() => setViewerSource(null)} />
    </div>
  );
}

function NoDocsPrompt() {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-accent">
        <DocsIcon width={30} height={30} />
      </div>
      <div>
        <p className="text-base font-semibold text-navy-900">No documents yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-navy-500">
          Add a document — or load the sample — before asking. Every answer is
          grounded in what you&apos;ve uploaded.
        </p>
      </div>
      <Link href="/">
        <Button size="md">
          <DocsIcon width={16} height={16} /> Go to Documents
        </Button>
      </Link>
    </div>
  );
}

function WelcomePrompt({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-white shadow-glow">
        <ChatIcon width={30} height={30} />
      </div>
      <div>
        <p className="text-base font-semibold text-navy-900">Ask about your documents</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-navy-500">
          Answers are grounded in your library, with citations you can verify in
          the Sources panel.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="inline-flex items-center gap-1.5 rounded-full border border-navy-100 bg-white px-3 py-1.5 text-[12px] font-medium text-navy-600 transition-colors hover:border-accent hover:text-accent"
          >
            <SparkIcon width={13} height={13} />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
