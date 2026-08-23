"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { errorMessage, getFileUrl, getHighlight } from "@/lib/api";
import type { HighlightResponse } from "@/lib/types";
import { cn } from "@/lib/cn";
import { IconButton, Spinner, AlertIcon, CloseIcon } from "@/components/atoms";

// Bundled worker (copied to public/ at setup) — offline-safe, version-matched.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// The citation the viewer opens on. `page` is null for non-PDF docs (no page
// view) — those fall straight to the snippet.
export interface PdfViewerSource {
  documentId: string;
  filename: string;
  chunkId: number;
  page: number | null;
  snippet: string;
}

export interface PdfViewerProps {
  source: PdfViewerSource | null;
  onClose: () => void;
}

type Status = "loading" | "ready" | "error" | "unsupported";

// Horizontal padding of the scroll body (p-4 → 16px each side): pages are
// sized to the container's content box so they never overflow sideways.
const BODY_GUTTER_PX = 32;
// Pages within this margin of the viewport get a real <Page> mounted;
// everything further away stays a fixed-height placeholder (docs are capped
// at 80 pages server-side, so eager canvases would be far too heavy).
const MOUNT_ROOT_MARGIN = "800px 0px";
// US Letter fallback aspect ratio (h/w) when no page dims are known yet.
const DEFAULT_PAGE_RATIO = 11 / 8.5;

// Modal PDF viewer: renders the FULL document as a vertically scrolled stack,
// lazily mounting pages near the viewport (IntersectionObserver windowing),
// auto-scrolls to the cited location on open, and overlays highlight rects
// from GET /highlight (D11) on the cited page only. Ladder: exact rects →
// page-only (no wrong highlight) → snippet (non-PDF / load failure).
// Rendered client-only (dynamic ssr:false).
export function PdfViewer({ source, onClose }: PdfViewerProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<HighlightResponse | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(720);
  const [numPages, setNumPages] = useState<number | null>(null);
  // Pages currently near the viewport (windowing set, observer-managed).
  const [mountedPages, setMountedPages] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  // Real h/w ratio per page, learned from each Page's onLoadSuccess; until
  // then placeholders use the cited page's ratio (or US Letter).
  const [pageRatios, setPageRatios] = useState<Record<number, number>>({});
  // Most-visible page, for the live "Page X of Y" header.
  const [visiblePage, setVisiblePage] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  // Stable per-page ref callbacks so React doesn't detach/reattach on rerender.
  const pageRefCallbacks = useRef(
    new Map<number, (el: HTMLDivElement | null) => void>(),
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const didScrollRef = useRef(false);

  // Escape to close.
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source, onClose]);

  // Measure the available width so pages fit the modal (and rects scale).
  useLayoutEffect(() => {
    if (!source) return;
    const measure = () => {
      const w = containerRef.current?.clientWidth;
      if (w) setPageWidth(Math.max(280, w - BODY_GUTTER_PX));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [source, status]);

  // Fetch the signed file URL + highlight rects when a source opens.
  useEffect(() => {
    if (!source) return;
    setStatus("loading");
    setFileUrl(null);
    setHighlight(null);
    setErrMsg(null);
    setNumPages(null);
    setMountedPages(new Set());
    setPageRatios({});
    setVisiblePage(1);
    didScrollRef.current = false;
    pageEls.current.clear();
    pageRefCallbacks.current.clear();

    if (source.page === null) {
      // Non-PDF (docx/txt/md/url) — no page view; go straight to the snippet.
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [file, hl] = await Promise.all([
          getFileUrl(source.documentId),
          getHighlight(source.documentId, source.chunkId).catch(() => null),
        ]);
        if (cancelled) return;
        setFileUrl(file.url);
        setHighlight(hl);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrMsg(errorMessage(err));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  const citedPageRaw = highlight?.page ?? source?.page ?? 1;
  const citedPage = Math.min(Math.max(1, citedPageRaw), numPages ?? citedPageRaw);

  // Scale PDF-point rects to the rendered page width.
  const scale =
    highlight?.page_w && highlight.page_w > 0 ? pageWidth / highlight.page_w : null;
  const rects = useMemo(
    () => (scale && highlight ? highlight.rects : []),
    [scale, highlight],
  );

  // Placeholder aspect ratio: real dims once known, else the cited page's
  // ratio from the highlight payload, else US Letter.
  const defaultRatio =
    highlight?.page_w && highlight?.page_h && highlight.page_w > 0
      ? highlight.page_h / highlight.page_w
      : DEFAULT_PAGE_RATIO;
  const ratioFor = useCallback(
    (p: number): number => pageRatios[p] ?? defaultRatio,
    [pageRatios, defaultRatio],
  );

  // Windowing observer: one observer over every per-page wrapper; a generous
  // rootMargin mounts pages well before they scroll into view and unmounts
  // canvases that drift far away.
  useEffect(() => {
    if (status !== "ready" || numPages === null) return;
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setMountedPages((prev) => {
          let next: Set<number> | null = null;
          for (const entry of entries) {
            const p = Number((entry.target as HTMLElement).dataset.page);
            if (!Number.isFinite(p)) continue;
            const current = next ?? prev;
            if (entry.isIntersecting && !current.has(p)) {
              next = next ?? new Set(prev);
              next.add(p);
            } else if (!entry.isIntersecting && current.has(p)) {
              next = next ?? new Set(prev);
              next.delete(p);
            }
          }
          return next ?? prev;
        });
      },
      { root, rootMargin: MOUNT_ROOT_MARGIN },
    );
    observerRef.current = observer;
    for (const el of pageEls.current.values()) observer.observe(el);
    return () => {
      observerRef.current = null;
      observer.disconnect();
    };
  }, [status, numPages]);

  // Live "Page X of Y": rAF-throttled scroll tracking of the page with the
  // largest visible overlap (coarse is fine).
  useEffect(() => {
    if (status !== "ready" || numPages === null) return;
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const contRect = container.getBoundingClientRect();
      let best = 0;
      let bestOverlap = 0;
      for (const [p, el] of pageEls.current) {
        const r = el.getBoundingClientRect();
        const overlap =
          Math.min(r.bottom, contRect.bottom) - Math.max(r.top, contRect.top);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = p;
        }
      }
      if (best > 0) setVisiblePage(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [status, numPages]);

  // Stable ref callback per page: registers the wrapper and keeps the
  // observer in sync when wrappers mount/unmount.
  const getPageRef = useCallback((p: number) => {
    let cb = pageRefCallbacks.current.get(p);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        const prev = pageEls.current.get(p);
        if (prev && observerRef.current) observerRef.current.unobserve(prev);
        if (el) {
          pageEls.current.set(p, el);
          observerRef.current?.observe(el);
        } else {
          pageEls.current.delete(p);
        }
      };
      pageRefCallbacks.current.set(p, cb);
    }
    return cb;
  }, []);

  // Initial jump to the cited location. The cited page is force-mounted, so
  // its onRenderSuccess fires once the canvas has painted at real height —
  // only then is the wrapper's offset trustworthy enough to scroll to. If
  // rects exist, center the first rect vertically; otherwise land on the top
  // of the cited page. Instant (`auto`), not smooth: the user should arrive,
  // not watch an 80-page fly-by.
  const scrollToCitation = useCallback(() => {
    if (didScrollRef.current) return;
    const container = containerRef.current;
    const el = pageEls.current.get(citedPage);
    if (!container || !el) return;
    didScrollRef.current = true;
    const contRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const pageTop = container.scrollTop + (elRect.top - contRect.top);
    const first = scale && rects.length > 0 ? rects[0] : null;
    const target =
      first && scale
        ? pageTop + first.y * scale + (first.h * scale) / 2 - container.clientHeight / 2
        : pageTop - 8;
    container.scrollTo({ top: Math.max(0, target), behavior: "auto" });
  }, [citedPage, scale, rects]);

  const onPageDims = useCallback(
    (p: number, dims: { originalWidth: number; originalHeight: number }) => {
      if (dims.originalWidth <= 0) return;
      const ratio = dims.originalHeight / dims.originalWidth;
      setPageRatios((prev) => (prev[p] === ratio ? prev : { ...prev, [p]: ratio }));
    },
    [],
  );

  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  if (!source) return null;

  const pages =
    numPages !== null
      ? Array.from({ length: numPages }, (_, i) => i + 1)
      : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Source: ${source.filename}`}
      onClick={onClose}
    >
      <div
        onClick={stop}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-navy-100 bg-surface shadow-lift"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy-900" title={source.filename}>
              {source.filename}
            </p>
            <p className="text-[12px] text-navy-400">
              {status === "ready" && numPages !== null
                ? `Page ${visiblePage} of ${numPages}`
                : source.page
                  ? `Page ${citedPage}`
                  : "Document source"}
              {status === "ready" && rects.length === 0 ? " · exact match not pinpointed" : ""}
            </p>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <CloseIcon width={18} height={18} />
          </IconButton>
        </div>

        {/* Body */}
        <div ref={containerRef} className="scroll-thin min-h-0 flex-1 overflow-auto bg-canvas p-4">
          {status === "loading" ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-navy-500">
              <Spinner size="sm" /> Loading document…
            </div>
          ) : status === "error" ? (
            <Fallback
              snippet={source.snippet}
              note={`Couldn't open the PDF (${errMsg ?? "unknown error"}). Showing the cited passage instead.`}
            />
          ) : status === "unsupported" ? (
            <Fallback
              snippet={source.snippet}
              note="This document type has no page view. Here is the cited passage."
            />
          ) : fileUrl ? (
            <Document
              file={fileUrl}
              onLoadSuccess={(doc: { numPages: number }) => setNumPages(doc.numPages)}
              loading={
                <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-navy-500">
                  <Spinner size="sm" /> Rendering…
                </div>
              }
              error={<Fallback snippet={source.snippet} note="Couldn't render the PDF. Showing the cited passage." />}
            >
              <div className="flex flex-col items-center">
                {pages.map((p) => {
                  // The cited page (and its neighbors) is always mounted so
                  // the initial jump has a real canvas to land on.
                  const isMounted =
                    mountedPages.has(p) || Math.abs(p - citedPage) <= 1;
                  const placeholderH = Math.round(pageWidth * ratioFor(p));
                  const blank = (
                    <div style={{ width: pageWidth, height: placeholderH }} />
                  );
                  return (
                    <div key={p} data-page={p} ref={getPageRef(p)}>
                      <div className="relative inline-block bg-surface leading-none shadow-card">
                        {isMounted ? (
                          <Page
                            pageNumber={p}
                            width={pageWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            loading={blank}
                            onLoadSuccess={(dims: {
                              originalWidth: number;
                              originalHeight: number;
                            }) => onPageDims(p, dims)}
                            onRenderSuccess={p === citedPage ? scrollToCitation : undefined}
                          />
                        ) : (
                          blank
                        )}
                        {/* Highlight overlays: cited page ONLY (exact-match
                            rung of the ladder). */}
                        {p === citedPage && scale
                          ? rects.map((r, i) => (
                              <div
                                key={i}
                                className="pointer-events-none absolute rounded-[2px] bg-accent/25 ring-1 ring-accent/60 mix-blend-multiply"
                                style={{
                                  left: r.x * scale,
                                  top: r.y * scale,
                                  width: r.w * scale,
                                  height: r.h * scale,
                                }}
                              />
                            ))
                          : null}
                      </div>
                      <p className="mb-4 mt-1.5 text-center text-[11px] text-navy-400">
                        {p} / {numPages}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Document>
          ) : null}
        </div>

        {/* Footer: always show the snippet as a verifiable text fallback. */}
        <div className={cn("border-t border-navy-100 px-4 py-3")}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
            Cited passage
          </p>
          <p className="max-h-24 overflow-auto text-[12.5px] leading-relaxed text-navy-600">
            {source.snippet}
          </p>
        </div>
      </div>
    </div>
  );
}

function Fallback({ snippet, note }: { snippet: string; note: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-3 py-8">
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-relevance-medium">
        <AlertIcon width={15} height={15} className="mt-0.5 shrink-0" />
        <span>{note}</span>
      </div>
      <p className="rounded-lg border border-navy-100 bg-surface p-3 text-[13px] leading-relaxed text-navy-700">
        {snippet}
      </p>
    </div>
  );
}

export default PdfViewer;
