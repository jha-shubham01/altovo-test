import type { DocumentRecord } from "@/lib/types";
import { cn } from "@/lib/cn";
import {
  Button,
  EmptyState,
  FileTile,
  Spinner,
  DocsIcon,
} from "@/components/atoms";

// Colored icon medallion for the empty / error states (adds warmth vs a bare
// grey glyph).
function IconBadge({ tone }: { tone: "brand" | "danger" }) {
  return (
    <span
      className={cn(
        "flex h-14 w-14 items-center justify-center rounded-2xl",
        tone === "brand" ? "bg-brand-soft text-accent" : "bg-red-50 text-relevance-weak",
      )}
    >
      <DocsIcon width={26} height={26} />
    </span>
  );
}

export interface DocumentListProps {
  documents: DocumentRecord[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
  onLoadSample: () => void;
  loadingSample: boolean;
}

// Presentational list of documents with explicit loading / empty / error
// states. Data + actions arrive via props (state rule).
export function DocumentList({
  documents,
  loading,
  error,
  onRetry,
  onDelete,
  deletingId,
  onLoadSample,
  loadingSample,
}: DocumentListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-navy-500">
        <Spinner size="sm" />
        Loading documents…
      </div>
    );
  }

  // Only take over the whole panel when there's nothing to show. A transient
  // failure during background polling must not wipe an already-loaded library.
  if (error && documents.length === 0) {
    return (
      <EmptyState
        icon={<IconBadge tone="danger" />}
        title="Couldn't load documents"
        copy={error}
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={<IconBadge tone="brand" />}
        title="No documents yet"
        copy="Upload a file or paste a URL to start asking questions — or load a sample to try it out."
        action={
          <Button size="sm" loading={loadingSample} onClick={onLoadSample}>
            Load sample document
          </Button>
        }
      />
    );
  }

  return (
    <>
      {error ? (
        <p className="mb-2.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[12px] text-relevance-medium">
          Couldn&apos;t refresh just now — showing the last known list.
        </p>
      ) : null}
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {documents.map((doc) => (
        <li key={doc.id} className="animate-fade-in-up">
          <FileTile
            filename={doc.filename}
            mimeType={doc.mime_type}
            sourceType={doc.source_type}
            status={doc.status}
            sizeBytes={doc.size_bytes}
            pageCount={doc.page_count}
            error={doc.error}
            deleting={deletingId === doc.id}
            onDelete={() => onDelete(doc.id)}
          />
          </li>
        ))}
      </ul>
    </>
  );
}
