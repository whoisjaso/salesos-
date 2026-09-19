"use client";

import { useMemo, useState } from "react";
import { Surface } from "@/components/ui/Surface";
import { Segmented } from "./Segmented";
import { initials } from "./NextUp";
import { formatDateTimeIn, TENANT_TZ } from "@/lib/workspace-setter";
import { QUEUE_TYPE_LABEL, type CloserQueueItem, type CloserQueueType } from "@/lib/workspace-closer";

const TYPES: CloserQueueType[] = ["commitments", "questions", "proposals", "contract", "payment", "delivery"];

/** Queue by type (SOS-10). A promised callback never hides behind a probability-sorted deal list. */
export function CloserQueue({ items, onSelect }: { items: CloserQueueItem[]; onSelect?: (item: CloserQueueItem) => void }) {
  const [type, setType] = useState<CloserQueueType>("commitments");
  const counts = useMemo(() => Object.fromEntries(TYPES.map((t) => [t, items.filter((i) => i.type === t).length])) as Record<CloserQueueType, number>, [items]);
  const visible = items.filter((i) => i.type === type);
  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented<CloserQueueType> items={TYPES.map((t) => ({ id: t, label: counts[t] ? `${QUEUE_TYPE_LABEL[t]} ${counts[t]}` : QUEUE_TYPE_LABEL[t] }))} value={type} onChange={setType} className="min-w-[560px]" />
      </div>
      <Surface padding="none" as="section" aria-label={QUEUE_TYPE_LABEL[type]}>
        <ul className="divide-y divide-line">
          {visible.map((q) => (
            <li key={q.id}>
              <button type="button" onClick={() => onSelect?.(q)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover motion-reduce:transition-none">
                <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-fg">{initials(q.contact.displayName)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-fg">{q.contact.displayName}</span>
                  <span className="block truncate text-[12px] text-fg-muted">{q.label}</span>
                </span>
                {q.when ? <span className="tabular shrink-0 text-[12px] text-fg-subtle">{formatDateTimeIn(q.when, TENANT_TZ)}</span> : null}
              </button>
            </li>
          ))}
          {visible.length === 0 ? <li className="px-4 py-6 text-center text-[13px] text-fg-subtle">Nothing here</li> : null}
        </ul>
      </Surface>
    </div>
  );
}
