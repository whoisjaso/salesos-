"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  className?: string;
}

/** Underline tabs with roving arrow-key focus. */
export function Tabs({ items, value, defaultValue, onChange, className }: TabsProps) {
  const baseId = useId();
  const layoutId = `${baseId}-ink`;
  const reduce = useReducedMotion();
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.id);
  const active = value ?? internal;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
    const pos = enabled.indexOf(index);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = enabled[(pos + 1) % enabled.length];
    if (e.key === "ArrowLeft") next = enabled[(pos - 1 + enabled.length) % enabled.length];
    if (e.key === "Home") next = enabled[0];
    if (e.key === "End") next = enabled[enabled.length - 1];
    if (next !== null) {
      e.preventDefault();
      refs.current[next]?.focus();
      select(items[next].id);
    }
  };

  return (
    <div className={className}>
      <div role="tablist" className="relative flex gap-1 border-b border-line">
        {items.map((it, i) => {
          const selected = it.id === active;
          return (
            <button
              key={it.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${it.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${it.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={it.disabled}
              onClick={() => select(it.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "relative -mb-px h-9 px-3 text-[13px] font-medium transition-colors motion-reduce:transition-none",
                selected ? "text-fg" : "text-fg-muted hover:text-fg",
                it.disabled && "opacity-40",
              )}
            >
              {it.label}
              {selected ? (
                <motion.span
                  layoutId={reduce ? undefined : layoutId}
                  className="absolute inset-x-2 bottom-0 h-px bg-fg"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {items.map((it) => (
        <div
          key={it.id}
          role="tabpanel"
          id={`${baseId}-panel-${it.id}`}
          aria-labelledby={`${baseId}-tab-${it.id}`}
          hidden={it.id !== active}
          className="pt-4"
        >
          {it.id === active ? it.content : null}
        </div>
      ))}
    </div>
  );
}
