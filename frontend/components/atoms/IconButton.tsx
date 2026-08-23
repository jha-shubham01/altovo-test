import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type IconButtonVariant = "ghost" | "destructive";

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: "text-navy-600 hover:bg-navy-50 hover:text-navy-900",
  destructive: "text-navy-500 hover:bg-red-50 hover:text-relevance-weak",
};

const SIZES = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
} as const;

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  // Required: icon buttons have no visible text label.
  label: string;
  variant?: IconButtonVariant;
  size?: keyof typeof SIZES;
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      variant = "ghost",
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
        aria-label={label}
        title={label}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center rounded-lg transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:cursor-not-allowed disabled:text-navy-300 disabled:hover:bg-transparent",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner size="sm" /> : children}
      </button>
    );
  },
);
