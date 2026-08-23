import type { DocumentStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import { docTypeLabel, formatBytes } from "@/lib/format";
import { Badge } from "./Badge";
import type { BadgeTone } from "./Badge";
import { IconButton } from "./IconButton";
import { FileIcon, LinkIcon, TrashIcon } from "./icons";

const STATUS_TONE: Record<DocumentStatus, BadgeTone> = {
  processing: "processing",
  ready: "ready",
  failed: "failed",
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export interface FileTileProps {
  filename: string;
  mimeType: string;
  sourceType: "upload" | "url";
  status: DocumentStatus;
  sizeBytes: number | null;
  pageCount: number | null;
  error?: string | null;
  onDelete?: () => void;
  deleting?: boolean;
}

// Presentational tile: type badge + name + status pill + meta + delete. No data
// fetching; the parent owns delete.
export function FileTile({
  filename,
  mimeType,
  sourceType,
  status,
  sizeBytes,
  pageCount,
  error,
  onDelete,
  deleting = false,
}: FileTileProps) {
  const meta = [
    formatBytes(sizeBytes),
    pageCount ? `${pageCount} page${pageCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return (
    <div className="flex h-full items-start gap-3 rounded-xl border border-navy-100 bg-surface p-3 shadow-sm transition-shadow hover:border-navy-200 hover:shadow-card">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        {sourceType === "url" ? (
          <LinkIcon width={18} height={18} />
        ) : (
          <FileIcon width={18} height={18} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className="truncate text-sm font-medium text-navy-900"
            title={filename}
          >
            {filename}
          </p>
          <span className="shrink-0 rounded bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold text-navy-500">
            {docTypeLabel(mimeType, filename)}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge
            tone={STATUS_TONE[status]}
            dot={status === "processing"}
            className={cn(status === "processing" && "animate-pulse")}
          >
            {STATUS_LABEL[status]}
          </Badge>
          {meta.length > 0 ? (
            <span className="text-[11px] text-navy-400">{meta.join(" · ")}</span>
          ) : null}
        </div>

        {status === "failed" && error ? (
          <p className="mt-1.5 text-[11px] leading-snug text-relevance-weak">
            {error}
          </p>
        ) : null}
      </div>

      {onDelete ? (
        <IconButton
          label={`Delete ${filename}`}
          variant="destructive"
          size="sm"
          loading={deleting}
          onClick={onDelete}
          className="shrink-0"
        >
          <TrashIcon />
        </IconButton>
      ) : null}
    </div>
  );
}
