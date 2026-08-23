import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "processing"
  | "ready"
  | "failed"
  | "accent";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-navy-50 text-navy-600",
  processing: "bg-amber-50 text-relevance-medium",
  ready: "bg-green-50 text-relevance-strong",
  failed: "bg-red-50 text-relevance-weak",
  accent: "bg-blue-50 text-accent",
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  // Optional leading dot for status pills.
  dot?: boolean;
}

export function Badge({ tone = "neutral", children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
