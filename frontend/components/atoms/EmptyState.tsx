import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  copy?: ReactNode;
  action?: ReactNode;
  className?: string;
}

// Presentational placeholder used by every empty/idle async view.
export function EmptyState({
  icon,
  title,
  copy,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="text-navy-300" aria-hidden>
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-navy-900">{title}</p>
        {copy ? (
          <p className="mx-auto max-w-xs text-[13px] leading-relaxed text-navy-500">
            {copy}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
