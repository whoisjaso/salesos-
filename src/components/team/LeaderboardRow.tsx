"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CaretRight, CheckCircle, HourglassMedium, Minus } from "@phosphor-icons/react";
import type { FunnelStage, LeaderboardRow as Row } from "@/domain/types";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { formatBasis, formatCount, formatMoney, formatMoneyMinor } from "@/lib/format";
import { movementOf, rowRole } from "@/lib/team-data";
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

function perLead(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "N/A";
  return formatMoneyMinor(Math.round(value), currency, { cents: true });
}

const MOVE_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;
const MOVE_LABEL = {
  up: "Up on own prior period",
  down: "Down on own prior period",
  flat: "Level with own prior period",
} as const;

/**
 * Avatar (tier mark as its badge), name, one number. Tap the row for the sheet:
 * funnel, prior period and movement, tier, provisional state, a correction request.
 */
export function LeaderboardRow({ row, descriptive = false, isMe = false, funnel, correctionSent, onRequestCorrection }: LeaderboardRowProps) {
  const [open, setOpen] = useState(false);
  const { openCard } = useRepCard();
  const currency = row.revenuePerLead.currency ?? row.totalRevenue.currency;
  const move = movementOf(row);
  const MoveIcon = move === "none" ? null : MOVE_ICON[move];
  const tier = seasonTierFor(row.userId, rowRole(row));
  const value = perLead(row.revenuePerLead.value, currency);

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
        <span className="tabular shrink-0 text-[17px] font-semibold leading-none tracking-tight text-fg">{value}</span>
        <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={row.displayName} description={`${formatBasis(row.basis)} per assigned opportunity`}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="tabular text-[28px] font-semibold leading-none tracking-tight text-fg">{value}</span>
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
                    Provisional
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
            <SheetRow label="Total">{formatMoney(row.totalRevenue)}</SheetRow>
            <SheetRow label="Matured">
              {formatCount(row.maturedSample)} of {formatCount(row.assignedOpportunities)}
            </SheetRow>
            <SheetRow label="Attended">{formatCount(row.attendedAppointments)}</SheetRow>
            <SheetRow label="Wins">{formatCount(row.wins)}</SheetRow>
            <SheetRow label="Refunds">{formatCount(row.refundCount)}</SheetRow>
            <SheetRow label="Prior">{row.priorPeriodRevenuePerLead === undefined ? "Not set" : perLead(row.priorPeriodRevenuePerLead, currency)}</SheetRow>
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

function SheetRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 first:pt-0">
      <dt className="text-[13px] font-medium text-fg-muted">{label}</dt>
      <dd className="tabular text-[13.5px] leading-relaxed text-fg">{children}</dd>
    </div>
  );
}
