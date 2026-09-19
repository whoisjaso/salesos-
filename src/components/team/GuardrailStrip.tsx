"use client";

import { ShieldCheck } from "@phosphor-icons/react";
import type { GuardrailCounts } from "@/lib/team-data";
import { formatCount } from "@/lib/format";

/** Customer guardrails (SOS-15). A rise in any of these pauses the affected game mechanic. */
export function GuardrailStrip({ counts }: { counts: GuardrailCounts }) {
  const items: { label: string; value: string }[] = [
    { label: "Opt-outs", value: formatCount(counts.optOuts) },
    { label: "Complaints", value: counts.complaints === null ? "Not tracked" : formatCount(counts.complaints) },
    { label: "Refunds", value: formatCount(counts.refunds) },
  ];
  return (
    <div className="surface flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted">
        <ShieldCheck size={16} weight="regular" aria-hidden className="text-fg-subtle" />
        Guardrails
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-baseline gap-1.5">
            <dd className="tabular text-[15px] font-semibold text-fg">{it.value}</dd>
            <dt className="text-[12px] text-fg-subtle">{it.label}</dt>
          </div>
        ))}
      </dl>
      <span className="text-[12px] text-fg-subtle sm:ml-auto">A rise pauses the game mechanic</span>
    </div>
  );
}
