"use client";

import { Sheet } from "@/components/ui/Sheet";
import type { LeaderboardPolicy } from "@/domain/leaderboard";
import { formatBasis } from "@/lib/format";

export interface RulesSheetProps {
  open: boolean;
  onClose: () => void;
  policy: LeaderboardPolicy;
}

/** The leaderboard policy in plain words. Every rule here is declared before use (SOS-14). */
export function RulesSheet({ open, onClose, policy }: RulesSheetProps) {
  const rules: { title: string; body: string }[] = [
    { title: "Primary metric", body: `${formatBasis(policy.basis)} per assigned opportunity, inside the declared cohort.` },
    {
      title: "Eligibility",
      body: `Active role, reconciled data, and a matured sample of at least ${policy.minMaturedSample} opportunities.`,
    },
    { title: "Tie rule", body: "Equal values share the order by display name. Declared before the period starts." },
    { title: "Pause conditions", body: "Unresolved attendance or an unlinked payment pauses consequential ranks until fixed." },
    { title: "Appeals", body: "Every rep can inspect counted opportunities and request a correction." },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Rules" description={`Policy ${policy.policyVersion}`}>
      <ol className="flex flex-col divide-y divide-line">
        {rules.map((r, i) => (
          <li key={r.title} className="flex gap-3 py-3.5 first:pt-0">
            <span className="tabular w-5 shrink-0 text-[13px] font-medium text-fg-subtle">{i + 1}</span>
            <div>
              <div className="text-[14px] font-medium text-fg">{r.title}</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">{r.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-[12px] leading-relaxed text-fg-subtle">
        Rankings are never the sole basis for pay, employment, or lead removal. Seasons reset the display, not the history.
      </p>
    </Sheet>
  );
}
