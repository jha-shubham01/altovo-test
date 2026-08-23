"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  ask,
  deleteDocument,
  errorMessage,
  fetchLocalFile,
  listDocuments,
  resetWorkspace,
  uploadAndIngest,
} from "@/lib/api";
import { MAX_HISTORY_TURNS, SAMPLE_DOC_PATH } from "@/lib/constants";
import type {
  ChatMessage as ChatMessageModel,
  Citation,
  DocumentRecord,
  RetrievedSource,
} from "@/lib/types";

// Mirrors api/prompts.py NOT_FOUND_MESSAGE — safety-net only (the backend
// streams the canned message itself, so this renders only if that delta is lost).
const NOT_FOUND_TEXT =
  "I couldn't find anything in the uploaded documents that answers this. " +
  "Try rephrasing, or upload a document that covers it.";

export type PendingConfirm =
  | { kind: "reset" }
  | { kind: "delete"; doc: DocumentRecord }
  | null;

function newId(): string {
  return crypto.randomUUID();
}

// App-level state shared by both routes. With a multi-page layout the plan's
// "state at page level" rule becomes "state in one app-level client provider"
// so chat + library survive navigation between /(documents) and /ask.
interface AppState {
  // Documents
  documents: DocumentRecord[];
  docsLoading: boolean;
  docsError: string | null;
  deletingId: string | null;
  readyDocCount: number;
  canAsk: boolean;
  refreshDocuments: () => Promise<void>;
  retryDocuments: () => void;
  requestDelete: (id: string) => void;
  loadingSample: boolean;
  sampleError: string | null;
  loadSample: () => Promise<void>;

  // Chat
  messages: ChatMessageModel[];
  streaming: boolean;
  activeSources: RetrievedSource[];
  activeNoneCited: boolean;
  activeCitedChunkIds: number[];
  activeChunkId: number | null;
  askQuestion: (q: string) => void;
  stop: () => void;
  onCitationClick: (messageId: string, chunkId: number) => void;

  // Confirm dialog
  pending: PendingConfirm;
  confirmBusy: boolean;
  requestReset: () => void;
  confirmAction: () => Promise<void>;
  cancelConfirm: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessageModel[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [activeAnswerId, setActiveAnswerId] = useState<string | null>(null);
  const [activeChunkId, setActiveChunkId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [pending, setPending] = useState<PendingConfirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const refreshDocuments = useCallback(async () => {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
      setDocsError(null);
    } catch (err) {
      setDocsError(errorMessage(err));
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  // Poll while anything is still processing so status pills settle on their own.
  const hasProcessing = useMemo(
    () => documents.some((d) => d.status === "processing"),
    [documents],
  );
  useEffect(() => {
    if (!hasProcessing) return;
    const t = setInterval(() => void refreshDocuments(), 2500);
    return () => clearInterval(t);
  }, [hasProcessing, refreshDocuments]);

  const patchMessage = useCallback(
    (id: string, patch: Partial<ChatMessageModel>) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    },
    [],
  );

  const askQuestion = useCallback(
    (question: string) => {
      if (streaming) return;
      // A turn = user+assistant exchange, so keep the last N*2 messages (D13).
      const history = messages
        .filter((m) => !m.error && !m.notFound && m.content.trim().length > 0)
        .slice(-(MAX_HISTORY_TURNS * 2))
        .map((m) => ({ role: m.role, content: m.content }));

      const userMsg: ChatMessageModel = { id: newId(), role: "user", content: question };
      const answerId = newId();
      const answerMsg: ChatMessageModel = {
        id: answerId,
        role: "assistant",
        content: "",
        streaming: true,
      };
      setMessages((prev) => [...prev, userMsg, answerMsg]);
      setActiveAnswerId(answerId);
      setActiveChunkId(null);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      void ask(
        { question, history },
        {
          onSources: (sources: RetrievedSource[], flags) => {
            patchMessage(answerId, {
              sources,
              weakMatch: flags.weakMatch,
              notFound: flags.notFound,
            });
          },
          onDelta: (text: string) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === answerId ? { ...m, content: m.content + text } : m,
              ),
            );
          },
          onCitations: (citations: Citation[]) => {
            patchMessage(answerId, { citations });
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== answerId) return m;
                const content =
                  m.notFound && m.content.trim().length === 0 ? NOT_FOUND_TEXT : m.content;
                return { ...m, content, streaming: false };
              }),
            );
            setStreaming(false);
            abortRef.current = null;
          },
          onError: (err) => {
            patchMessage(answerId, { streaming: false, error: err.message });
            setStreaming(false);
            abortRef.current = null;
          },
        },
        controller.signal,
      );
    },
    [streaming, messages, patchMessage],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    if (activeAnswerId) patchMessage(activeAnswerId, { streaming: false });
  }, [activeAnswerId, patchMessage]);

  const loadSample = useCallback(async () => {
    setLoadingSample(true);
    setSampleError(null);
    try {
      const file = await fetchLocalFile(
        SAMPLE_DOC_PATH,
        "sample-altovo-handbook.pdf",
        "application/pdf",
      );
      await uploadAndIngest(file);
      await refreshDocuments();
    } catch (err) {
      setSampleError(errorMessage(err));
    } finally {
      setLoadingSample(false);
    }
  }, [refreshDocuments]);

  const requestDelete = useCallback(
    (id: string) => {
      const doc = documents.find((d) => d.id === id);
      if (doc) setPending({ kind: "delete", doc });
    },
    [documents],
  );

  const requestReset = useCallback(() => setPending({ kind: "reset" }), []);

  const confirmAction = useCallback(async () => {
    if (!pending) return;
    setConfirmBusy(true);
    try {
      if (pending.kind === "reset") {
        await resetWorkspace();
        setMessages([]);
        setActiveAnswerId(null);
        setActiveChunkId(null);
        await refreshDocuments();
      } else {
        setDeletingId(pending.doc.id);
        await deleteDocument(pending.doc.id);
        await refreshDocuments();
      }
      setPending(null);
    } catch (err) {
      setDocsError(errorMessage(err));
      setPending(null);
    } finally {
      setConfirmBusy(false);
      setDeletingId(null);
    }
  }, [pending, refreshDocuments]);

  const cancelConfirm = useCallback(() => {
    if (!confirmBusy) setPending(null);
  }, [confirmBusy]);

  const activeSources = useMemo<RetrievedSource[]>(() => {
    const msg = messages.find((m) => m.id === activeAnswerId);
    return msg?.sources ?? [];
  }, [messages, activeAnswerId]);

  // True when the answer finished, passages were retrieved, but the validated
  // citation set is empty — i.e. the model looked at these and used none
  // (typically a grounded refusal). Lets the Sources panel explain itself
  // instead of appearing to contradict the answer.
  const activeNoneCited = useMemo<boolean>(() => {
    const msg = messages.find((m) => m.id === activeAnswerId);
    if (!msg || msg.streaming) return false;
    return (
      (msg.sources?.length ?? 0) > 0 &&
      msg.citations !== undefined &&
      msg.citations.length === 0
    );
  }, [messages, activeAnswerId]);

  // Chunk ids the active answer actually cited (validated set). Drives the
  // "Cited" ordering/badges in the Sources panel.
  const activeCitedChunkIds = useMemo<number[]>(() => {
    const msg = messages.find((m) => m.id === activeAnswerId);
    return (msg?.citations ?? []).map((c) => c.chunk_id);
  }, [messages, activeAnswerId]);

  const onCitationClick = useCallback((messageId: string, chunkId: number) => {
    // Point the Sources panel at the clicked message's answer (so citations in
    // earlier turns resolve, not just the latest), then scroll to the passage
    // once the panel has re-rendered with that message's sources.
    setActiveAnswerId(messageId);
    setActiveChunkId(chunkId);
    setTimeout(() => {
      document
        .getElementById(`source-${chunkId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }, []);

  const readyDocCount = useMemo(
    () => documents.filter((d) => d.status === "ready").length,
    [documents],
  );

  const value: AppState = {
    documents,
    docsLoading,
    docsError,
    deletingId,
    readyDocCount,
    canAsk: readyDocCount > 0,
    refreshDocuments,
    retryDocuments: () => {
      setDocsLoading(true);
      void refreshDocuments();
    },
    requestDelete,
    loadingSample,
    sampleError,
    loadSample,
    messages,
    streaming,
    activeSources,
    activeNoneCited,
    activeCitedChunkIds,
    activeChunkId,
    askQuestion,
    stop,
    onCitationClick,
    pending,
    confirmBusy,
    requestReset,
    confirmAction,
    cancelConfirm,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
