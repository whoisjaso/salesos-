"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { STAGES } from "./stages";

export interface StageRailProps {
  value: string;
  onChange: (stage: string) => void;
  /** id of the panel the rail controls, for aria-controls. */
  panelId: string;
  className?: string;
}

/**
 * Nine stage chips in workflow order. Scrolls sideways on a phone.
 * Arrow keys move the selection; the active pill slides between chips.
 */
export function StageRail({ value, onChange, panelId, className }: StageRailProps) {
  const baseId = useId();
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const next = STAGES[index];
    if (!next) return;
    onChange(next.stage);
    const el = refs.current[index];
    el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: reduce ? "auto" : "smooth" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const n = STAGES.length;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % n;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + n) % n;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = n - 1;
    if (next !== null) {
      e.preventDefault();
      select(next);
    }
  };

  return (
    <div className={cn("-mx-4 sm:mx-0", className)}>
      <div
        role="tablist"
        aria-label="Stages"
        className="flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {STAGES.map((s, i) => {
          const selected = s.stage === value;
          const Icon = s.icon;
          return (
            <button
              key={s.stage}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`${baseId}-${s.stage}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(s.stage)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "relative inline-flex h-9 shrink-0 select-none items-center gap-2 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap",
                "transition-colors duration-150 motion-reduce:transition-none",
                selected ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {selected ? (
                <motion.span
                  layoutId={reduce ? undefined : `${baseId}-pill`}
                  aria-hidden
                  className="absolute inset-0 rounded-full border border-line-strong bg-raised shadow-sm"
                  transition={{ type: "spring", stiffness: 520, damping: 42 }}
                />
              ) : null}
              <Icon size={15} weight={selected ? "fill" : "regular"} aria-hidden className={cn("relative", selected ? "text-accent" : "text-fg-subtle")} />
              <span className="relative">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
