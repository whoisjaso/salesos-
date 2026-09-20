"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
}

export interface SegmentedProps<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  className?: string;
}

/** Radio-style segmented control. Arrow keys move the selection; the active pill slides. */
export function Segmented<T extends string>({ label, options, value, onChange, size = "sm", className }: SegmentedProps<T>) {
  const id = useId();
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % options.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = options.length - 1;
    if (next !== null) {
      e.preventDefault();
      refs.current[next]?.focus();
      onChange(options[next].id);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border border-line-strong bg-raised p-0.5",
        size === "sm" ? "h-8" : "h-10",
        className,
      )}
    >
      {options.map((opt, i) => {
        const selected = opt.id === value;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative inline-flex h-full min-w-9 items-center justify-center whitespace-nowrap rounded-[6px] font-medium transition-colors motion-reduce:transition-none",
              size === "sm" ? "px-2.5 text-[12px]" : "px-3.5 text-[13px]",
              selected ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={reduce ? undefined : `${id}-pill`}
                aria-hidden
                className="absolute inset-0 rounded-[6px] bg-hover ring-1 ring-line-strong"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            ) : null}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
