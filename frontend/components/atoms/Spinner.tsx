import { cn } from "@/lib/cn";

// Presentational only. Sizes map to the 8px grid.
const SIZES = {
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-[3px]",
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  label?: string;
}

export function Spinner({ size = "md", className, label }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      className={cn(
        "inline-block animate-spin rounded-full border-navy-200 border-t-navy-900",
        SIZES[size],
        className,
      )}
    />
  );
}
