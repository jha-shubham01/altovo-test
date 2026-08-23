"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store";
import { Button, DocsIcon, ChatIcon, BookIcon } from "@/components/atoms";

const LINKS = [
  { href: "/", label: "Documents", Icon: DocsIcon },
  { href: "/ask", label: "Ask", Icon: ChatIcon },
  { href: "/about", label: "About", Icon: BookIcon },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const { readyDocCount, streaming, requestReset, documents } = useApp();

  return (
    <header className="glass sticky top-0 z-30 border-b border-navy-100/70">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-[15px] font-bold text-white shadow-glow">
            A
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-[15px] font-semibold text-navy-900">
              Altovo <span className="gradient-text">DocQA</span>
            </span>
            <span className="mt-0.5 text-[11px] text-navy-400">
              Grounded answers, cited to the source
            </span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="ml-2 flex items-center gap-1">
          {LINKS.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-navy-500 hover:bg-navy-50 hover:text-navy-900",
                )}
              >
                <Icon width={16} height={16} />
                <span className="hidden sm:inline">{label}</span>
                {href === "/" && documents.length > 0 ? (
                  <span
                    className={cn(
                      "ml-0.5 rounded-full px-1.5 text-[11px] font-semibold",
                      active ? "bg-accent/15 text-accent" : "bg-navy-100 text-navy-500",
                    )}
                  >
                    {documents.length}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-[12px] text-navy-400 md:inline-flex">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                readyDocCount > 0 ? "bg-relevance-strong" : "bg-navy-200",
              )}
            />
            {readyDocCount} ready
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={requestReset}
            disabled={streaming || documents.length === 0}
          >
            Reset
          </Button>
        </div>
      </div>
    </header>
  );
}
