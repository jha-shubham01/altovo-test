import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

// Presentational text input matching the design tokens (rounded-lg, navy border,
// accent focus ring). Local UI only.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 w-full rounded-lg border bg-surface px-3 text-sm text-navy-900",
        "placeholder:text-navy-300",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:bg-navy-50 disabled:text-navy-400",
        invalid ? "border-relevance-weak" : "border-navy-200",
        className,
      )}
      {...rest}
    />
  );
});
