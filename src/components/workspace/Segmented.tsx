"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export interface SegmentedProps<T extends string> {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

/** iOS-style segmented control. Fixed height; the indicator slides, the labels never move. */
export function Segmented<T extends string>({ items, value, onChange, className }: SegmentedProps<T>) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div role="tablist" className={cn("grid h-10 rounded-[10px] bg-sunken p-1", className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => {
        const selected = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(it.id)}
            className={cn("relative rounded-[8px] text-[13px] font-medium transition-colors motion-reduce:transition-none", selected ? "text-fg" : "text-fg-muted hover:text-fg")}
          >
            {selected ? (
              <motion.span
                layoutId={reduce ? undefined : `${id}-seg`}
                className="absolute inset-0 rounded-[8px] bg-raised shadow-sm"
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
              />
            ) : null}
            <span className="relative">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
