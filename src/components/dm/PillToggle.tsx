import * as React from "react";
import { cn } from "@/lib/utils";

export interface PillToggleProps {
  checked: boolean;
  onCheckedChange?: (next: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  tone?: "primary" | "destructive";
  title?: string;
  className?: string;
  /** Stop click from bubbling to the row */
  stopPropagation?: boolean;
}

/**
 * Compact pill-style toggle used as a modern replacement for row checkboxes
 * in the field-list views. Drop-in for `<input type="checkbox">` semantics.
 */
export const PillToggle = React.forwardRef<HTMLButtonElement, PillToggleProps>(
  function PillToggle(
    {
      checked,
      onCheckedChange,
      indeterminate = false,
      disabled = false,
      size = "md",
      tone = "primary",
      title,
      className,
      stopPropagation = true,
    },
    ref,
  ) {
    const dims =
      size === "sm"
        ? { track: "h-[14px] w-6", dot: "h-[10px] w-[10px]", translate: "translate-x-[10px]" }
        : { track: "h-4 w-7", dot: "h-3 w-3", translate: "translate-x-[12px]" };

    const toneOn =
      tone === "destructive"
        ? "bg-destructive border-destructive shadow-[0_0_0_3px_hsl(var(--destructive)/0.18)]"
        : "bg-primary border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]";

    const on = checked && !indeterminate;
    const mixed = indeterminate;

    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={mixed ? "mixed" : on}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        title={title}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          if (disabled) return;
          onCheckedChange?.(!checked);
        }}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            if (stopPropagation) e.stopPropagation();
            if (disabled) return;
            onCheckedChange?.(!checked);
          }
        }}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full border transition-all duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          dims.track,
          on || mixed
            ? toneOn
            : "border-border/70 bg-surface-2 hover:border-border-strong",
          disabled && "cursor-not-allowed opacity-40 shadow-none",
          !disabled && "cursor-pointer",
          className,
        )}
      >
        {mixed ? (
          <span
            className={cn(
              "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground",
              size === "sm" ? "h-[2px] w-2" : "h-[2px] w-2.5",
            )}
          />
        ) : (
          <span
            className={cn(
              "pointer-events-none ml-[2px] rounded-full transition-transform duration-150 ease-out",
              dims.dot,
              on ? `${dims.translate} bg-primary-foreground` : "translate-x-0 bg-muted-foreground/60",
            )}
          />
        )}
      </button>
    );
  },
);

export default PillToggle;