"use client";

import { useState, type ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { CalendarX, CheckCircle, ClockCounterClockwise, HourglassMedium, LinkBreak } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import type { TrustItem, TrustSeverity } from "@/lib/owner-model";

const ICON: Record<TrustItem["id"], ComponentType<IconProps>> = {
  freshness: ClockCounterClockwise,
  attendance: CalendarX,
  unlinked: LinkBreak,
  immature: HourglassMedium,
};

const TONE: Record<TrustSeverity, string> = {
  info: "text-fg-muted",
  warning: "text-perf-attention",
  critical: "text-perf-issue",
};

const OUTLINE: Record<TrustSeverity, string> = {
  info: "border-line-strong",
  warning: "border-[color:var(--perf-attention-line)]",
  critical: "border-[color:var(--perf-issue-line)]",
};

/** Three icons and counts on one line. Tap opens the affected records. */
export function TrustLine({ items }: { items: TrustItem[] }) {
  const [open, setOpen] = useState(false);
  const line = items.filter((i) => i.id !== "immature").slice(0, 3);
  const worst: TrustSeverity = items.some((i) => i.severity === "critical") ? "critical" : items.some((i) => i.severity === "warning") ? "warning" : "info";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Data trust. Open details."
        className={cn(
          "surface flex h-11 w-full items-center gap-4 overflow-hidden px-4 text-left transition-colors hover:bg-hover motion-reduce:transition-none",
          OUTLINE[worst],
        )}
      >
        {line.length === 0 ? (
          <span className="inline-flex items-center gap-2 text-[13px] text-fg">
            <CheckCircle size={16} weight="bold" aria-hidden className="text-perf-strong" />
            All feeds reconciled
          </span>
        ) : (
          line.map((item) => {
            const Icon = ICON[item.id];
            return (
              <span key={item.id} className={cn("inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium", TONE[item.severity])}>
                <Icon size={16} weight="bold" aria-hidden className="shrink-0" />
                <span className="tabular truncate">{item.label}</span>
              </span>
            );
          })
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Data trust">
        <div className="flex flex-col gap-6">
          {items.map((item) => {
            const Icon = ICON[item.id];
            return (
              <section key={item.id} aria-label={item.title}>
                <div className={cn("flex items-center gap-2 text-[14px] font-semibold", TONE[item.severity])}>
                  <Icon size={16} weight="bold" aria-hidden />
                  <span>{item.title}</span>
                  <span className="tabular ml-auto text-[12px] font-medium text-fg-subtle">{item.records.length}</span>
                </div>
                <ul className="mt-2 divide-y divide-line border-t border-line">
                  {item.records.map((r) => (
                    <li key={r.id} className="flex flex-col gap-0.5 py-2 text-[13px]">
                      <span className="font-mono text-[11px] text-fg-subtle">{r.id}</span>
                      <span className="text-fg">{r.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {items.length === 0 ? <p className="text-[13px] text-fg-muted">All feeds reconciled.</p> : null}
        </div>
      </Sheet>
    </>
  );
}
