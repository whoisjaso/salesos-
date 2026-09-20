import { ArrowUDownLeft, Check, Warning } from "@phosphor-icons/react/dist/ssr";
import { countsAsNetCollectedCash } from "@/domain/events";
import { disputeAtRisk } from "@/domain/metrics";
import type { LedgerEntry, Opportunity } from "@/domain/types";
import type { Money } from "@/domain/types";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { LADDER_STEPS, ladderIndex, ladderNote } from "@/lib/workspace-closer";

export interface FinancialLadderProps {
  opportunity: Opportunity;
  verbalYes: boolean;
  ledger: LedgerEntry[];
  net: Money;
}

/**
 * Seven separate statuses on one line (SOS-10). Done steps are filled, the current step is
 * labeled "Now", Collected shows a ledger amount only when a ledger entry exists. Every
 * step name stays in the accessibility tree; only the current one and an amount are drawn.
 *
 * Three honesty rules (docs/PAYMENTS_AUDIT.md H4):
 * - A collected amount is drawn only from movements that count as net collected cash, so a
 *   test-mode or manually-marked movement never renders as money that arrived.
 * - A refunded opportunity carries a Refunded mark on the Collected step and sits at Signed.
 *   It never reads as Collected.
 * - An open dispute shows an at-risk figure beside collected cash. It is never subtracted.
 *   Each of these has a word and an icon, so none of them is carried by colour alone.
 */
export function FinancialLadder({ opportunity, verbalYes, ledger, net }: FinancialLadderProps) {
  const current = ladderIndex(opportunity, verbalYes);
  const note = ladderNote(opportunity);
  const hasCash = ledger.some((e) => e.kind === "payment_collected" && countsAsNetCollectedCash(e));
  const signedUnpaid = opportunity.contractState === "signed" && !hasCash;
  const atRisk = disputeAtRisk(ledger, net.currency);
  const showAtRisk = atRisk.amountMinor > 0 || (note?.atRisk ?? false);

  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex items-center" aria-label="Financial state">
        {LADDER_STEPS.map((s, i) => {
          const done = i < current;
          const now = i === current;
          const reversedHere = s.id === "collected" && (note?.reversed ?? false);
          const collectedText = s.id === "collected" ? (hasCash ? formatMoney(net) : signedUnpaid ? "$0 collected" : undefined) : undefined;
          const labeled = now || Boolean(collectedText) || reversedHere;
          return (
            <li key={s.id} className={cn("flex min-w-0 items-center", labeled && "flex-1")}>
              {i > 0 ? <span aria-hidden className={cn("h-px w-3 shrink-0", done || now ? "bg-perf-strong" : "bg-line-strong")} /> : null}
              <span
                className={cn(
                  "inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                  reversedHere
                    ? "border-line-strong text-fg-subtle"
                    : done
                      ? "border-perf-strong bg-perf-strong text-accent-fg"
                      : now
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-line-strong",
                )}
                aria-hidden
              >
                {reversedHere ? <ArrowUDownLeft size={11} weight="bold" /> : done ? <Check size={11} weight="bold" /> : null}
              </span>
              <span className={cn("ml-1.5 truncate text-[13px]", now ? "font-semibold text-fg" : "sr-only")}>{s.label}</span>
              {collectedText ? <span className={cn("ml-1.5 shrink-0 text-[12px] font-medium", hasCash ? "text-fg" : "text-perf-attention")}>{collectedText}</span> : null}
              {now ? <span className="ml-1.5 shrink-0 text-[10.5px] font-medium uppercase tracking-wide text-accent">Now</span> : null}
            </li>
          );
        })}
      </ol>

      {note ? (
        <p className="flex items-start gap-1.5 text-[12px] leading-snug text-fg-muted" aria-label={note.statement}>
          {note.reversed ? (
            <ArrowUDownLeft size={12} weight="bold" aria-hidden className="mt-[2px] shrink-0" />
          ) : note.atRisk ? (
            <Warning size={12} weight="bold" aria-hidden className="mt-[2px] shrink-0" />
          ) : null}
          <span>
            <span className="font-medium text-fg">{note.label}.</span> {note.statement}
          </span>
        </p>
      ) : null}

      {showAtRisk ? (
        <p className="tabular text-[12px] leading-snug text-fg-muted">
          <span className="font-medium text-fg">{formatMoney(atRisk)} at risk.</span> Disputed and not yet decided. Still counted in collected cash, never debited twice.
        </p>
      ) : null}
    </div>
  );
}
