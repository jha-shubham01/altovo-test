"use client";

import Link from "next/link";
import { useApp } from "@/lib/store";
import { UploadDropzone } from "@/components/common/UploadDropzone";
import { DocumentList } from "@/components/common/DocumentList";
import { ChatIcon, ShieldIcon, SparkIcon } from "@/components/atoms";

export default function DocumentsPage() {
  const {
    documents,
    docsLoading,
    docsError,
    deletingId,
    readyDocCount,
    canAsk,
    refreshDocuments,
    retryDocuments,
    requestDelete,
    loadingSample,
    sampleError,
    loadSample,
  } = useApp();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      {/* Hero */}
      <section className="animate-fade-in-up overflow-hidden rounded-2xl border border-navy-100 bg-brand-soft p-6 shadow-card sm:p-8">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[12px] font-medium text-accent">
          <SparkIcon width={14} height={14} /> Grounded document Q&amp;A
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900 sm:text-[28px]">
          Ask your documents anything —{" "}
          <span className="gradient-text">get answers with citations</span>
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-navy-500">
          Upload PDFs, Word docs, or text — or point at a URL. Every answer is
          grounded in what you provide and cites the exact source passage.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Feature icon={<ShieldIcon width={14} height={14} />} label="Answers cite their source" />
          <Feature icon={<SparkIcon width={14} height={14} />} label="Hybrid search with rank fusion (RRF)" />
          <Feature icon={<ChatIcon width={14} height={14} />} label="Says so when it doesn't know" />
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Add documents */}
        <aside className="space-y-3 self-start lg:sticky lg:top-24">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-navy-400">
            Add documents
          </h2>
          <UploadDropzone onIngested={() => void refreshDocuments()} disabled={loadingSample} />
          {sampleError ? (
            <p className="text-[12px] text-relevance-weak">{sampleError}</p>
          ) : null}
        </aside>

        {/* Library */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-navy-400">
              Library{" "}
              {documents.length > 0 ? (
                <span className="text-navy-300">· {readyDocCount} ready</span>
              ) : null}
            </h2>
            {canAsk ? (
              <Link
                href="/ask"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white shadow-glow transition-transform hover:-translate-y-0.5"
              >
                <ChatIcon width={15} height={15} /> Ask questions
              </Link>
            ) : null}
          </div>
          <div className="rounded-2xl border border-navy-100 bg-surface p-3 shadow-card sm:p-4">
            <DocumentList
              documents={documents}
              loading={docsLoading}
              error={docsError}
              onRetry={retryDocuments}
              onDelete={requestDelete}
              deletingId={deletingId}
              onLoadSample={() => void loadSample()}
              loadingSample={loadingSample}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-navy-100 bg-white/70 px-3 py-1 text-[12px] font-medium text-navy-600">
      <span className="text-accent">{icon}</span>
      {label}
    </span>
  );
}
