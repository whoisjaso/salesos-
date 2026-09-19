"use client";

import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export interface NextUpChip {
  id: string;
  name: string;
  icon: ComponentType<IconProps>;
  /** Very short, e.g. "3:34 PM" or "27 d". */
  hint: string;
}

export interface NextUpProps {
  items: NextUpChip[];
  activeId?: string;
  onSelect: (id: string) => void;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Slim row of avatar chips for the next queue items. Tapping one swaps the hero. */
export function NextUp({ items, activeId, onSelect }: NextUpProps) {
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-2" aria-label="Next up">
      <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Next</span>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
        {items.slice(0, 3).map((it) => {
          const Icon = it.icon;
          const active = it.id === activeId;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it.id)}
              aria-pressed={active}
              className={cn(
                "flex h-11 min-w-0 shrink-0 items-center gap-2 rounded-full border pl-1 pr-3 text-left transition-colors motion-reduce:transition-none",
                active ? "border-accent bg-accent-soft" : "border-line bg-raised hover:bg-hover",
              )}
            >
              <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-fg">
                {initials(it.name)}
              </span>
              <span className="min-w-0">
                <span className="block max-w-[96px] truncate text-[13px] font-medium leading-tight text-fg">{it.name.split(" ")[0]}</span>
                <span className="tabular flex items-center gap-1 text-[11px] leading-tight text-fg-subtle">
                  <Icon size={11} aria-hidden />
                  {it.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
