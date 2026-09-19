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
 * Six separate statuses on one line (SOS-10). Done steps are filled, the current step is
 * labeled "Now", Collected shows a ledger amount only when a ledger entry exists. Every
 * step name stays in the accessibility tree; only the current one and an amount are drawn.
 */
export function FinancialLadder({ opportunity, verbalYes, ledger, net }: FinancialLadderProps) {
  const current = ladderIndex(opportunity, verbalYes);
  const hasLedger = ledger.some((e) => e.kind === "payment_collected");
  const signedUnpaid = opportunity.contractState === "signed" && !hasLedger;
  return (
    <ol className="flex items-center" aria-label="Financial state">
      {LADDER_STEPS.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const collectedText = s.id === "collected" ? (hasLedger ? formatMoney(net) : signedUnpaid ? "$0 collected" : undefined) : undefined;
        const labeled = now || Boolean(collectedText);
        return (
          <li key={s.id} className={cn("flex min-w-0 items-center", labeled && "flex-1")}>
            {i > 0 ? <span aria-hidden className={cn("h-px w-3 shrink-0", done || now ? "bg-perf-strong" : "bg-line-strong")} /> : null}
            <span
              className={cn(
                "inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                done ? "border-perf-strong bg-perf-strong text-accent-fg" : now ? "border-accent bg-accent text-accent-fg" : "border-line-strong",
              )}
              aria-hidden
            >
              {done ? <Check size={11} weight="bold" /> : null}
            </span>
            <span className={cn("ml-1.5 truncate text-[13px]", now ? "font-semibold text-fg" : "sr-only")}>{s.label}</span>
            {collectedText ? <span className={cn("ml-1.5 shrink-0 text-[12px] font-medium", hasLedger ? "text-fg" : "text-perf-attention")}>{collectedText}</span> : null}
            {now ? <span className="ml-1.5 shrink-0 text-[10.5px] font-medium uppercase tracking-wide text-accent">Now</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
