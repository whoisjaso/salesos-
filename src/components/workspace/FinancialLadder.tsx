import { Check } from "@phosphor-icons/react/dist/ssr";
import type { LedgerEntry, Opportunity } from "@/domain/types";
import type { Money } from "@/domain/types";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { LADDER_STEPS, ladderIndex } from "@/lib/workspace-closer";

export interface FinancialLadderProps {
  opportunity: Opportunity;
  verbalYes: boolean;
  ledger: LedgerEntry[];
  net: Money;
}

/**
 * Six separate statuses (SOS-10). A verbal yes is a task, a signature is not cash,
 * and Collected shows a ledger amount only when a ledger entry exists.
 */
export function FinancialLadder({ opportunity, verbalYes, ledger, net }: FinancialLadderProps) {
  const current = ladderIndex(opportunity, verbalYes);
  const hasLedger = ledger.some((e) => e.kind === "payment_collected");
  const signedUnpaid = opportunity.contractState === "signed" && !hasLedger;
  return (
    <ol className="flex flex-col" aria-label="Financial state">
      {LADDER_STEPS.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const collectedText = s.id === "collected" ? (hasLedger ? formatMoney(net) : signedUnpaid ? "$0 collected" : undefined) : undefined;
        return (
          <li key={s.id} className="flex items-center gap-3 py-1.5">
            <span className="flex flex-col items-center self-stretch">
              <span
                className={cn(
                  "inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px]",
                  done ? "border-perf-strong bg-perf-strong text-accent-fg" : now ? "border-accent bg-accent text-accent-fg" : "border-line-strong text-transparent",
                )}
                aria-hidden
              >
                {done ? <Check size={11} weight="bold" /> : null}
              </span>
            </span>
            <span className={cn("flex-1 text-[13.5px]", now ? "font-semibold text-fg" : done ? "text-fg-muted" : "text-fg-subtle")}>{s.label}</span>
            {collectedText ? <span className={cn("tabular text-[12.5px] font-medium", hasLedger ? "text-fg" : "text-perf-attention")}>{collectedText}</span> : null}
            {now ? <span className="text-[10.5px] font-medium uppercase tracking-wide text-accent">Now</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
