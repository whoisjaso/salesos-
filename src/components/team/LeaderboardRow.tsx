"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CaretRight, CheckCircle, HourglassMedium, Minus, Question } from "@phosphor-icons/react";
import type { FunnelStage, LeaderboardRow as Row } from "@/domain/types";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { MONEY_NOT_AVAILABLE, formatBasis, formatCount, formatMoney, formatMoneyMinor } from "@/lib/format";
import { attendedRead, movementOf, rowMoneyRead, rowRole, type MoneyRead } from "@/lib/team-data";
import { Avatar } from "@/components/ui/Avatar";
import { TierBadge } from "@/components/cash/TierBadge";
import { seasonTierFor } from "@/components/cash/tier-lookup";
import { useRepCard } from "@/components/profile/RepCardSheet";
import { MiniFunnel } from "./MiniFunnel";

export interface LeaderboardRowProps {
  row: Row;
  descriptive?: boolean;
  isMe?: boolean;
  funnel: FunnelStage[];
  correctionSent: boolean;
  onRequestCorrection: () => void;
}

const MOVE_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;
const MOVE_LABEL = {
  up: "Up on own prior period",
  down: "Down on own prior period",
  flat: "Level with own prior period",
} as const;

/**
 * The money on a row, in three shapes that never look alike: a figure, a
 * verified zero, and a figure that does not exist. Each carries its own icon
 * and weight, so the difference survives without color.
 */
export function RowMoney({ read, size = "row" }: { read: MoneyRead; size?: "row" | "sheet" }) {
  const figure = size === "row" ? "text-[17px]" : "text-[28px]";
  if (read.kind === "unavailable") {
    return (
      <span className={cn("flex shrink-0 items-start gap-1.5 text-fg-muted", size === "row" ? "max-w-[116px]" : "")}>
        <Question size={14} weight="bold" aria-hidden className="mt-[1px] shrink-0" />
        <span className="text-[12px] font-medium leading-tight">{read.text}</span>
      </span>
    );
  }
  if (read.kind === "verified_zero") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-fg">
        <CheckCircle size={14} weight="bold" aria-hidden className="shrink-0 text-fg-muted" />
        <span className="tabular inline-flex items-baseline gap-1">
          <span className={cn(figure, "font-semibold leading-none tracking-tight")}>$0</span>
          <span className="text-[12px] text-fg-muted">collected</span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <span className={cn("tabular font-semibold leading-none tracking-tight text-fg", figure)}>{read.text}</span>
      {read.provisional ? (
        <span className="inline-flex items-center gap-1 text-[11px] leading-none text-fg-muted">
          <HourglassMedium size={11} weight="bold" aria-hidden />
          Provisional
        </span>
      ) : null}
    </span>
  );
}

/**
 * Avatar (tier mark as its badge), name, one number. A rank number appears only
 * when the standings are ranked. Tap the row for the sheet: funnel, prior period
 * and movement, tier, what is held, a correction request.
 */
export function LeaderboardRow({ row, descriptive = false, isMe = false, funnel, correctionSent, onRequestCorrection }: LeaderboardRowProps) {
  const [open, setOpen] = useState(false);
  const { openCard } = useRepCard();
  const move = movementOf(row);
  const MoveIcon = move === "none" ? null : MOVE_ICON[move];
  const tier = seasonTierFor(row.userId, rowRole(row));
  const money = rowMoneyRead(row);
  const total: MoneyRead =
    money.kind === "amount" ? { kind: "amount", text: formatMoney(row.totalRevenue), provisional: money.provisional } : money;

  return (
    <li className="relative border-b border-line last:border-b-0">
      {/* The avatar is its own control (opens the card), so it sits beside the row button, not inside it. */}
      <span className={cn("absolute top-3 z-[1] inline-flex", row.rank !== null ? "left-8" : "left-0")}>
        <Avatar userId={row.userId} size={40} badge={tier} onOpenCard={openCard} className={cn(isMe && "ring-2 ring-accent ring-offset-2 ring-offset-raised")} />
      </span>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-16 w-full items-center gap-3 py-2.5 text-left hover:bg-hover active:bg-hover">
        {row.rank !== null ? <span className="tabular w-5 shrink-0 text-right text-[13px] font-medium text-fg-subtle">{row.rank}</span> : null}
        <span aria-hidden className="h-10 w-10 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-tight text-fg">{row.displayName}</span>
        <RowMoney read={money} />
        <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={row.displayName} description={`${formatBasis(row.basis)} per assigned opportunity`}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <RowMoney read={money} size="sheet" />
            {MoveIcon ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-fg-muted">
                <MoveIcon size={14} weight="bold" aria-hidden className={cn(move === "up" && "text-perf-strong")} />
                {MOVE_LABEL[move as keyof typeof MOVE_LABEL]}
              </span>
            ) : null}
          </div>

          <dl className="flex flex-col divide-y divide-line">
            <SheetRow label="Standing">
              {row.rank !== null ? (
                <span>
                  #{row.rank}
                  {descriptive ? <span className="text-fg-muted">, descriptive</span> : null}
                </span>
              ) : (
                <span className="flex items-start gap-1.5">
                  <HourglassMedium size={13} weight="bold" aria-hidden className="mt-1.5 shrink-0 text-fg-subtle" />
                  <span>
                    Not ranked
                    {row.provisionalReason ? <span className="text-fg-muted">, {row.provisionalReason}</span> : null}
                  </span>
                </span>
              )}
            </SheetRow>
            <SheetRow label="Tier">
              {tier ? (
                <span className="flex items-start gap-2">
                  <TierBadge tier={tier} size={20} className="mt-0.5" />
                  <span>
                    {tier.label}
                    <span className="text-fg-muted">, by net collected cash this season, display only</span>
                  </span>
                </span>
              ) : (
                "No race entry"
              )}
            </SheetRow>
            {row.leadTier !== undefined ? <SheetRow label="Lead tier">T{row.leadTier}, compared within this tier only</SheetRow> : null}
            <SheetRow label="Total">
              <RowMoney read={total} size="row" />
            </SheetRow>
            <SheetRow label="Matured">
              {formatCount(row.maturedSample)} of {formatCount(row.assignedOpportunities)}
            </SheetRow>
            <SheetRow label="Attended">{attendedRead(row)}</SheetRow>
            <SheetRow label="Wins">{formatCount(row.wins)}</SheetRow>
            <SheetRow label="Refunds">{formatCount(row.refundCount)}</SheetRow>
            <SheetRow label="Prior">
              {row.priorPeriodRevenuePerLead === undefined ? "Not set" : <RowMoney read={priorRead(row)} size="row" />}
            </SheetRow>
            {row.heldStatement ? (
              <SheetRow label="Held">
                <span className="flex items-start gap-1.5">
                  <HourglassMedium size={13} weight="bold" aria-hidden className="mt-1.5 shrink-0 text-fg-subtle" />
                  <span className="text-fg-muted">{row.heldStatement}</span>
                </span>
              </SheetRow>
            ) : null}
          </dl>

          <section aria-label="Funnel" className="flex flex-col gap-2">
            <h3 className="section-label">Funnel</h3>
            <MiniFunnel stages={funnel} />
          </section>

          {correctionSent ? (
            <span className="inline-flex h-11 items-center gap-1.5 text-[14px] text-perf-strong">
              <CheckCircle size={16} weight="bold" aria-hidden />
              Sent for review
            </span>
          ) : (
            <Button variant="secondary" size="lg" onClick={onRequestCorrection} className="w-full">
              Request correction
            </Button>
          )}
        </div>
      </Sheet>
    </li>
  );
}

/** The prior period figure, read in the same shapes as the current one. */
function priorRead(row: Row): MoneyRead {
  const prior = row.priorPeriodRevenuePerLead;
  if (prior === null || prior === undefined) return { kind: "unavailable", text: MONEY_NOT_AVAILABLE, provisional: false };
  return { kind: "amount", text: formatMoneyMinor(Math.round(prior), row.revenuePerLead.currency ?? row.totalRevenue.currency, { cents: true }), provisional: false };
}

function SheetRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 first:pt-0">
      <dt className="text-[13px] font-medium text-fg-muted">{label}</dt>
      <dd className="tabular text-[13.5px] leading-relaxed text-fg">{children}</dd>
    </div>
  );
}
