"use client";

import { useCallback, useRef, useState } from "react";
import {
  fromUrl as apiFromUrl,
  uploadAndIngest,
  errorMessage,
} from "@/lib/api";
import type { UploadStage } from "@/lib/api";
import { FILE_ACCEPT, validateUploadFile } from "@/lib/constants";
import type { LinkedDocCandidate } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button, Input, Spinner, UploadIcon, LinkIcon } from "@/components/atoms";

// One entry in the transient per-file upload queue. This is local UI state
// (progress of an in-flight upload) — the durable document list lives at the
// page. On success we notify the parent so it can refetch.
interface QueueItem {
  id: string;
  name: string;
  status: "working" | "error";
  stage?: UploadStage;
  error?: string;
}

type Tab = "files" | "url";

const STAGE_LABEL: Record<UploadStage, string> = {
  signing: "Preparing…",
  uploading: "Uploading…",
  ingesting: "Processing…",
};

export interface UploadDropzoneProps {
  // Called after any successful ingest so the page can refresh the list.
  onIngested: () => void;
  disabled?: boolean;
}

export function UploadDropzone({ onIngested, disabled }: UploadDropzoneProps) {
  const [tab, setTab] = useState<Tab>("files");

  return (
    <div className="rounded-lg border border-navy-100 bg-surface">
      <div
        className="flex gap-1 border-b border-navy-100 p-1"
        role="tablist"
        aria-label="Add documents"
      >
        <TabButton
          active={tab === "files"}
          onClick={() => setTab("files")}
          id="tab-files"
          controls="panel-files"
        >
          <UploadIcon width={15} height={15} />
          Files
        </TabButton>
        <TabButton
          active={tab === "url"}
          onClick={() => setTab("url")}
          id="tab-url"
          controls="panel-url"
        >
          <LinkIcon width={15} height={15} />
          URL
        </TabButton>
      </div>

      <div className="p-3">
        {tab === "files" ? (
          <FilesTab onIngested={onIngested} disabled={disabled} />
        ) : (
          <UrlTab onIngested={onIngested} disabled={disabled} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  id,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  id: string;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        active
          ? "bg-brand text-white shadow-glow"
          : "text-navy-500 hover:bg-navy-50 hover:text-navy-900",
      )}
    >
      {children}
    </button>
  );
}

// --- Files tab ----------------------------------------------------------------

function FilesTab({
  onIngested,
  disabled,
}: {
  onIngested: () => void;
  disabled?: boolean;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        const id = `${file.name}-${crypto.randomUUID()}`;
        const validationError = validateUploadFile(file);
        if (validationError) {
          setQueue((q) => [
            ...q,
            { id, name: file.name, status: "error", error: validationError },
          ]);
          continue;
        }
        setQueue((q) => [
          ...q,
          { id, name: file.name, status: "working", stage: "signing" },
        ]);
        void uploadAndIngest(file, (stage) => {
          setQueue((q) =>
            q.map((it) => (it.id === id ? { ...it, stage } : it)),
          );
        })
          .then(() => {
            // Drop the finished item from the transient queue; the doc now
            // lives in the page-level list, which we ask the parent to refresh.
            setQueue((q) => q.filter((it) => it.id !== id));
            onIngested();
          })
          .catch((err: unknown) => {
            setQueue((q) =>
              q.map((it) =>
                it.id === id
                  ? { ...it, status: "error", error: errorMessage(err) }
                  : it,
              ),
            );
          });
      }
    },
    [onIngested],
  );

  const dismiss = (id: string) =>
    setQueue((q) => q.filter((it) => it.id !== id));

  return (
    <div id="panel-files" role="tabpanel" aria-labelledby="tab-files">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-accent bg-accent-soft"
            : "border-navy-200 bg-canvas",
          disabled && "opacity-60",
        )}
      >
        <UploadIcon width={22} height={22} className="text-navy-300" />
        <p className="text-[13px] text-navy-500">
          Drag &amp; drop, or{" "}
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="font-medium text-accent underline underline-offset-2 disabled:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            browse
          </button>
        </p>
        <p className="text-[11px] text-navy-400">PDF, TXT, MD, DOCX · up to 15 MB</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queue.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {queue.map((it) => (
            <li
              key={it.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px]",
                it.status === "error"
                  ? "border-red-100 bg-red-50 text-relevance-weak"
                  : "border-navy-100 bg-canvas text-navy-600",
              )}
            >
              {it.status === "working" ? (
                <Spinner size="sm" />
              ) : null}
              <span className="min-w-0 flex-1 truncate" title={it.name}>
                {it.name}
              </span>
              {it.status === "working" ? (
                <span className="shrink-0 text-navy-400">
                  {it.stage ? STAGE_LABEL[it.stage] : ""}
                </span>
              ) : (
                <>
                  <span className="shrink-0" title={it.error}>
                    {it.error}
                  </span>
                  <button
                    type="button"
                    onClick={() => dismiss(it.id)}
                    className="shrink-0 font-medium underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  >
                    dismiss
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// --- URL tab ------------------------------------------------------------------

function UrlTab({
  onIngested,
  disabled,
}: {
  onIngested: () => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LinkedDocCandidate[] | null>(
    null,
  );
  const [confirming, setConfirming] = useState<string | null>(null);

  const submit = async (target: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFromUrl(target);
      if (res.document) {
        // A file link or an HTML page ingested directly.
        setUrl("");
        setCandidates(res.candidates ?? null);
        onIngested();
      } else if (res.candidates && res.candidates.length > 0) {
        // HTML page with linked documents to confirm.
        setCandidates(res.candidates);
      } else {
        setError("Nothing ingestable was found at that URL.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmCandidate = async (candidate: LinkedDocCandidate) => {
    setConfirming(candidate.url);
    setError(null);
    try {
      const res = await apiFromUrl(candidate.url);
      if (res.document) {
        setCandidates((c) =>
          c ? c.filter((x) => x.url !== candidate.url) : c,
        );
        onIngested();
      } else {
        setError("That link did not yield a document.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div id="panel-url" role="tabpanel" aria-labelledby="tab-url">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() && !loading && !disabled) void submit(url.trim());
        }}
        className="flex gap-2"
      >
        <Input
          type="url"
          inputMode="url"
          placeholder="https://example.com/report.pdf"
          value={url}
          disabled={disabled || loading}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Document URL"
        />
        <Button
          type="submit"
          size="md"
          loading={loading}
          disabled={disabled || url.trim().length === 0}
        >
          Fetch
        </Button>
      </form>

      <p className="mt-2 text-[11px] text-navy-400">
        Paste a direct file link, or a page — we&apos;ll list documents linked
        from it.
      </p>

      {error ? (
        <p className="mt-2 text-[12px] text-relevance-weak">{error}</p>
      ) : null}

      {candidates && candidates.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-medium text-navy-600">
            Linked documents
          </p>
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li
                key={c.url}
                className="flex items-center gap-2 rounded-lg border border-navy-100 bg-canvas px-2.5 py-1.5"
              >
                <LinkIcon width={14} height={14} className="shrink-0 text-navy-400" />
                <span
                  className="min-w-0 flex-1 truncate text-[12px] text-navy-700"
                  title={c.url}
                >
                  {c.label || c.url}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={confirming === c.url}
                  disabled={confirming !== null}
                  onClick={() => void confirmCandidate(c)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
