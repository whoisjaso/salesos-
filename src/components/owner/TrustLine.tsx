"use client";

import { useState, type ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { CalendarX, CheckCircle, ClockCounterClockwise, HourglassMedium, LinkBreak } from "@phosphor-icons/react";
import { DetailsRow } from "@/components/ui/DetailsRow";
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

const RANK: Record<TrustSeverity, number> = { info: 0, warning: 1, critical: 2 };

/** The item that most needs the owner: worst severity first, freshness as the tie-break. */
function headline(items: TrustItem[]): TrustItem | undefined {
  return [...items].filter((i) => i.id !== "immature").sort((a, b) => RANK[b.severity] - RANK[a.severity])[0];
}

/** One row: "Activity" and the one thing worth knowing. Tap opens every feed and its records. */
export function ActivityRow({ items }: { items: TrustItem[] }) {
  const [open, setOpen] = useState(false);
  const top = headline(items);
  const Icon = top ? ICON[top.id] : CheckCircle;

  return (
    <>
      <DetailsRow
        label="Activity"
        value={top ? top.label : "All feeds reconciled"}
        leading={<Icon size={16} weight="bold" aria-hidden className={cn(top ? TONE[top.severity] : "text-perf-strong")} />}
        data-testid="activity-open"
        onClick={() => setOpen(true)}
      />

      <Sheet open={open} onClose={() => setOpen(false)} title="Activity">
        <div className="flex flex-col gap-6">
          {items.map((item) => {
            const ItemIcon = ICON[item.id];
            return (
              <section key={item.id} aria-label={item.title}>
                <div className={cn("flex items-center gap-2 text-[14px] font-semibold", TONE[item.severity])}>
                  <ItemIcon size={16} weight="bold" aria-hidden />
                  <span>{item.title}</span>
                  <span className="tabular ml-auto text-[12px] font-medium text-fg-subtle">{item.records.length}</span>
                </div>
                <p className="mt-1 text-[12px] text-fg-muted">{item.affected}</p>
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
