"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}

/** Pill segmented control. The highlight slides once per change; nothing loops. */
export function Segmented<T extends string>({ options, value, onChange, label, size = "sm", className }: SegmentedProps<T>) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex shrink-0 rounded-sm border border-line bg-sunken p-0.5", className)}>
      {options.map((opt) => {
        const selected = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.id)}
            className={cn(
              "relative rounded-[6px] font-medium whitespace-nowrap transition-colors motion-reduce:transition-none",
              size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-8 px-3.5 text-[13px]",
              selected ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={reduce ? undefined : `${id}-pill`}
                aria-hidden
                className="absolute inset-0 rounded-[6px] bg-raised shadow-sm"
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

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  className?: string;
}

/** Labeled switch. Label is part of the control so the whole row is tappable. */
export function Switch({ checked, onChange, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("inline-flex min-h-8 items-center gap-2.5 text-[13px] text-fg-muted hover:text-fg", className)}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-block h-5 w-9 shrink-0 rounded-full border transition-colors motion-reduce:transition-none",
          checked ? "border-accent bg-accent" : "border-line-strong bg-sunken",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-[left] duration-150 motion-reduce:transition-none",
            checked ? "left-[18px] bg-accent-fg" : "left-0.5 bg-fg-muted",
          )}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}
