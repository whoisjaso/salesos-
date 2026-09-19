"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { STAGE_ACTION_LIBRARY } from "@/domain/coaching";
import { cn } from "@/lib/cn";
import { OWNER_LABEL } from "@/lib/team-data";

/** Stage-to-action library (SOS-16): observed issue, investigate first, possible action. */
export function ActionLibrary() {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section aria-label="Stage library">
      <div className="mb-2 text-[12px] text-fg-subtle">Investigate before blaming the rep</div>
      <ol className="surface divide-y divide-line px-4">
        {STAGE_ACTION_LIBRARY.map((s, i) => {
          const id = `${s.metricId}-${i}`;
          const open = openId === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : id)}
                className="flex w-full items-center gap-3 py-3 text-left hover:bg-hover"
              >
                <span className="tabular w-8 shrink-0 text-[11.5px] font-medium text-fg-subtle">{s.metricId}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{s.issue}</span>
                <span className="shrink-0 text-[11px] text-fg-subtle">{OWNER_LABEL[s.owner]}</span>
                <CaretDown size={13} weight="bold" aria-hidden className={cn("shrink-0 text-fg-faint transition-transform motion-reduce:transition-none", open && "rotate-180")} />
              </button>
              {open ? (
                <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2 pb-4 pl-11 text-[13px]">
                  <dt className="text-fg-subtle">Investigate</dt>
                  <dd className="text-fg-muted">{s.investigate.join(", ")}</dd>
                  <dt className="text-fg-subtle">Action</dt>
                  <dd className="text-fg">{s.action}</dd>
                  <dt className="text-fg-subtle">Effort</dt>
                  <dd className="text-fg-muted">{s.effort}</dd>
                </dl>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
