import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  BookIcon,
  ChatIcon,
  DocsIcon,
  ShieldIcon,
  SparkIcon,
  LinkIcon,
  AlertIcon,
} from "@/components/atoms";

export const metadata = {
  title: "Altovo DocQA — About",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-6">
      {/* Hero */}
      <section className="animate-fade-in-up rounded-2xl border border-navy-100 bg-surface p-7 shadow-card sm:p-10">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[12px] font-medium text-accent">
          <BookIcon width={14} height={14} /> About
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-navy-900 sm:text-[34px]">
          Grounded document Q&amp;A —{" "}
          <span className="gradient-text">answers you can verify</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-500">
          Altovo DocQA reads your documents and answers questions about them.
          Every answer is built <em>only</em> from what you upload, and each
          claim links back to the exact passage it came from — so you never have
          to take the model&apos;s word for it.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[14px] font-medium text-white shadow-glow transition-transform hover:-translate-y-0.5"
          >
            <DocsIcon width={16} height={16} /> Add documents
          </Link>
          <Link
            href="/ask"
            className="inline-flex items-center gap-2 rounded-lg border border-navy-200 bg-surface px-4 py-2.5 text-[14px] font-medium text-navy-800 transition-colors hover:border-navy-300 hover:bg-navy-50"
          >
            <ChatIcon width={16} height={16} /> Ask a question
          </Link>
        </div>
      </section>

      {/* --- The product --------------------------------------------------- */}

      <Section title="How it works" hint="From a raw file to a cited answer.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Step
            n={1}
            icon={<DocsIcon width={18} height={18} />}
            title="Add documents"
            body="Upload PDF, DOCX, TXT or Markdown — or paste a URL. Files go straight to secure storage; the server re-checks type and size before anything is read."
          />
          <Step
            n={2}
            icon={<SparkIcon width={18} height={18} />}
            title="Index"
            body="Each document is parsed page-by-page, split into ~450-token passages that never cross a page, embedded, and stored in a vector index alongside a keyword index."
          />
          <Step
            n={3}
            icon={<ChatIcon width={18} height={18} />}
            title="Ask"
            body="Your question runs a hybrid search — semantic vectors plus keyword match — fused with Reciprocal Rank Fusion, so exact terms and meaning both count."
          />
          <Step
            n={4}
            icon={<ShieldIcon width={18} height={18} />}
            title="Get a cited answer"
            body="The top passages are handed to the model, which answers with [n] citations. The server validates every citation, and the Sources panel lets you jump to each one."
          />
        </div>
      </Section>

      <Section
        title="Built to be trustworthy"
        hint="The whole point is an answer you can check."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Trust
            icon={<ShieldIcon width={18} height={18} />}
            title="Grounded & cited"
            body="Answers use only your documents. Citations are validated server-side — an invented or mismatched reference is stripped before you see it."
          />
          <Trust
            icon={<AlertIcon width={18} height={18} />}
            title="Knows its limits"
            body="If nothing relevant is found, it says “I couldn’t find this” instead of guessing — and skips the model call entirely to stay cheap and honest."
          />
          <Trust
            icon={<ChatIcon width={18} height={18} />}
            title="Handles ambiguity"
            body="When a question is underspecified or sources disagree, it names the ambiguity — stating its interpretation or asking one clarifying question."
          />
          <Trust
            icon={<SparkIcon width={18} height={18} />}
            title="Shows its confidence"
            body="Every source carries a relevance band, and a weak-match answer is flagged, so you can gauge how much to trust it at a glance."
          />
        </div>
      </Section>

      <Section title="Under the hood" hint="One free Gemini key runs the whole thing.">
        <div className="rounded-2xl border border-navy-100 bg-surface p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap gap-2">
            {[
              "Next.js 15 · App Router",
              "FastAPI · Python",
              "Supabase Postgres",
              "pgvector · HNSW",
              "Postgres full-text search",
              "Reciprocal Rank Fusion",
              "Gemini embeddings",
              "Gemini generation (SSE streaming)",
            ].map((t) => (
              <span
                key={t}
                className="rounded-full border border-navy-100 bg-canvas px-3 py-1.5 text-[12.5px] font-medium text-navy-700"
              >
                {t}
              </span>
            ))}
          </div>
          <p className="mt-4 text-[13.5px] leading-relaxed text-navy-500">
            The browser uploads files directly to storage (bypassing serverless
            body limits), the API streams answers over Server-Sent Events, and
            retrieval, generation, and citation validation all happen server-side.
          </p>
        </div>
      </Section>

      <Section title="Good to know">
        <ul className="grid gap-3 sm:grid-cols-3">
          <Note icon={<AlertIcon width={16} height={16} />}>
            Shared demo workspace — anyone with the link can upload, ask, or
            reset. Use non-sensitive documents only.
          </Note>
          <Note icon={<DocsIcon width={16} height={16} />}>
            Uploads are capped at 15 MB and 80 pages, across PDF, DOCX, TXT and
            Markdown.
          </Note>
          <Note icon={<LinkIcon width={16} height={16} />}>
            URL sources are fetched with an SSRF guard; questions run across your
            whole library.
          </Note>
        </ul>
      </Section>

      <div className="mt-10 flex items-center justify-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-[14px] font-medium text-white shadow-glow transition-transform hover:-translate-y-0.5"
        >
          Get started <ArrowRightIcon width={16} height={16} />
        </Link>
      </div>
    </div>
  );
}

/* --- helpers -------------------------------------------------------------- */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-[18px] font-semibold text-navy-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-[13.5px] text-navy-400">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-navy-100 bg-surface p-5 shadow-card transition-shadow hover:shadow-lift">
      <div className="relative shrink-0">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
          {icon}
        </span>
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white shadow-glow">
          {n}
        </span>
      </div>
      <div>
        <h3 className="text-[15px] font-semibold text-navy-900">{title}</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-navy-500">{body}</p>
      </div>
    </div>
  );
}

function Trust({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-surface p-5 shadow-card">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
        {icon}
      </span>
      <h3 className="mt-3 text-[15px] font-semibold text-navy-900">{title}</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-navy-500">{body}</p>
    </div>
  );
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 rounded-xl border border-navy-100 bg-surface p-4 text-[13px] leading-relaxed text-navy-600 shadow-sm">
      <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

