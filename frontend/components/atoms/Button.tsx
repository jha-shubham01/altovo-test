import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-glow hover:-translate-y-px hover:shadow-lift disabled:translate-y-0 disabled:bg-none disabled:bg-navy-300 disabled:shadow-none",
  secondary:
    "border border-navy-200 text-navy-800 bg-surface hover:border-navy-300 hover:bg-navy-50 disabled:border-navy-100 disabled:text-navy-300",
  ghost:
    "text-navy-700 bg-transparent hover:bg-navy-50 disabled:text-navy-300",
  destructive:
    "text-relevance-weak bg-transparent hover:bg-red-50 disabled:text-navy-300",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

// Presentational atom. Local UI only; no data fetching. `loading` shows a
// spinner and blocks clicks without changing layout.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:cursor-not-allowed",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Spinner size="sm" className="border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  },
);
