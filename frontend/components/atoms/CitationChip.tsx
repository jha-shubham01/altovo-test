import { cn } from "@/lib/cn";

export interface CitationChipProps {
  n: number;
  // D9: chips shown mid-stream are provisional until the validated `citations`
  // event reconciles them. Provisional = dashed + muted; validated = solid
  // accent. A provisional chip that never validates is rendered "stale".
  provisional?: boolean;
  // When false, the [n] was streamed but not present in the validated set —
  // it gets struck through so a stripped citation is visible, not silent.
  valid?: boolean;
  label?: string;
  onClick?: () => void;
}

export function CitationChip({
  n,
  provisional = false,
  valid = true,
  label,
  onClick,
}: CitationChipProps) {
  const interactive = Boolean(onClick) && valid;
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-label={label ?? `Source ${n}`}
      title={label ?? `Source ${n}`}
      className={cn(
        "mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 align-baseline text-[11px] font-semibold leading-none transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        !valid && "text-navy-300 line-through decoration-navy-300",
        valid && provisional &&
          "border border-dashed border-navy-300 text-navy-400",
        valid && !provisional &&
          "bg-blue-50 text-accent hover:bg-accent hover:text-white",
        interactive ? "cursor-pointer" : "cursor-default",
      )}
    >
      {n}
    </button>
  );
}
