"use client";

import { Sheet } from "@/components/ui/Sheet";
import type { LeaderboardPolicy } from "@/domain/leaderboard";
import type { GuardrailCounts } from "@/lib/team-data";
import { formatBasis, formatCount } from "@/lib/format";

export interface InfoSheetProps {
  open: boolean;
  onClose: () => void;
  policy: LeaderboardPolicy;
  guardrails: GuardrailCounts;
}

/** Rules and guardrails behind one info icon. Every rule is declared before use (SOS-14, SOS-15). */
export function InfoSheet({ open, onClose, policy, guardrails }: InfoSheetProps) {
  const rules: { title: string; body: string }[] = [
    { title: "Metric", body: `${formatBasis(policy.basis)} per assigned opportunity` },
    { title: "Eligible", body: `Active, reconciled data, ${policy.minMaturedSample}+ matured` },
    { title: "Ties", body: "Same value, order by name" },
    { title: "Paused when", body: "Unresolved attendance or unlinked payments" },
    { title: "Appeals", body: "Inspect counted opportunities, request a correction" },
    { title: "XP", body: "Verified stage events only, never pay" },
  ];
  const counts: { label: string; value: string }[] = [
    { label: "Opt-outs", value: formatCount(guardrails.optOuts) },
    { label: "Complaints", value: guardrails.complaints === null ? "Not tracked" : formatCount(guardrails.complaints) },
    { label: "Refunds", value: formatCount(guardrails.refunds) },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Rules" description={policy.policyVersion}>
      <dl className="flex flex-col divide-y divide-line">
        {rules.map((r) => (
          <div key={r.title} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-3 first:pt-0">
            <dt className="text-[13px] font-medium text-fg-muted">{r.title}</dt>
            <dd className="text-[13.5px] leading-relaxed text-fg">{r.body}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 mb-2 flex items-baseline justify-between">
        <h3 className="text-[12px] font-medium text-fg-subtle">Guardrails</h3>
        <span className="text-[12px] text-fg-subtle">Rise pauses XP</span>
      </div>
      <dl className="surface flex divide-x divide-line">
        {counts.map((c) => (
          <div key={c.label} className="flex flex-1 flex-col items-center gap-0.5 py-3">
            <dd className="tabular text-[17px] font-semibold text-fg">{c.value}</dd>
            <dt className="text-[12px] text-fg-subtle">{c.label}</dt>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
