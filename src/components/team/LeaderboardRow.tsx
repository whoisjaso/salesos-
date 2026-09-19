"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle,
  HourglassMedium,
  Minus,
} from "@phosphor-icons/react";
import type { FunnelStage, LeaderboardRow as Row } from "@/domain/types";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import {
  formatBasis,
  formatCount,
  formatMoney,
  formatMoneyMinor,
} from "@/lib/format";
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

const MOVE_ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
} as const;
const MOVE_LABEL = {
  up: "Up on own prior period",
  down: "Down on own prior period",
  flat: "Level with own prior period",
} as const;

/** Avatar, name, one number. Tap the row for the funnel, prior period, and a correction request. */
export function LeaderboardRow({
  row,
  descriptive = false,
  isMe = false,
  funnel,
  correctionSent,
  onRequestCorrection,
}: LeaderboardRowProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const { openCard } = useRepCard();
  const currency = row.revenuePerLead.currency ?? row.totalRevenue.currency;
  const panelId = `row-${row.userId}-${row.role}-detail`;
  const move = movementOf(row);
  const MoveIcon = move === "none" ? null : MOVE_ICON[move];
  const tier = seasonTierFor(row.userId, rowRole(row));

  return (
    <motion.li
      layout={!reduce}
      className="relative border-b border-line last:border-b-0"
    >
      {/* The avatar is its own control (opens the card), so it sits beside the row button, not inside it. */}
      <Avatar
        userId={row.userId}
        size={40}
        onOpenCard={openCard}
        className={cn("absolute top-3 z-[1]", row.rank !== null ? "left-8" : "left-0", isMe && "ring-2 ring-accent ring-offset-2 ring-offset-raised")}
      />
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-16 w-full items-center gap-3 py-2.5 text-left hover:bg-hover"
      >
        {row.rank !== null ? (
          <span className="tabular w-5 shrink-0 text-right text-[13px] font-medium text-fg-subtle">
            {row.rank}
          </span>
        ) : null}
        <span aria-hidden className="h-10 w-10 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span className="truncate text-[15px] font-medium leading-tight text-fg">
            {row.displayName}
          </span>
          <span className="flex items-center gap-1">
            {tier ? (
              <TierBadge
                tier={tier}
                size={20}
                tooltip={`${tier.label} tier, by net collected cash this season. Display only.`}
              />
            ) : null}
            {row.leadTier !== undefined ? (
              <Tooltip
                content={`Lead tier ${row.leadTier}. Compared within this tier only.`}
              >
                <span
                  tabIndex={0}
                  onClick={(e) => e.stopPropagation()}
                  className="tabular inline-grid h-5 w-6 shrink-0 place-items-center rounded-[4px] border border-line-strong text-[10.5px] font-semibold text-fg-muted"
                >
                  T{row.leadTier}
                </span>
              </Tooltip>
            ) : null}
            {row.provisional ? (
              <Tooltip content={row.provisionalReason ?? "Provisional"}>
                <span
                  tabIndex={0}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Provisional"
                  className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border border-dashed border-line-strong text-fg-muted"
                >
                  <HourglassMedium size={12} weight="bold" aria-hidden />
                </span>
              </Tooltip>
            ) : null}
            {descriptive && row.rank !== null ? (
              <span className="text-[10.5px] text-fg-subtle">descriptive</span>
            ) : null}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="tabular text-[17px] font-semibold leading-none tracking-tight text-fg">
            {perLead(row.revenuePerLead.value, currency)}
          </span>
          <span className="inline-flex h-5 items-center whitespace-nowrap rounded-[4px] bg-accent-soft px-1.5 text-[11px] font-medium text-accent">
            {formatBasis(row.basis)}
          </span>
        </span>
        <span
          className="inline-grid h-4 w-4 shrink-0 place-items-center text-fg-subtle"
          aria-label={move === "none" ? undefined : MOVE_LABEL[move]}
        >
          {MoveIcon ? (
            <MoveIcon
              size={14}
              weight="bold"
              aria-hidden
              className={cn(
                move === "up" && "text-perf-strong",
                move === "down" && "text-fg-muted",
              )}
            />
          ) : null}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="detail"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-5 pb-4 pl-12 sm:grid-cols-[minmax(0,1fr)_220px]">
              <MiniFunnel stages={funnel} />
              <div className="flex flex-col gap-3">
                <dl className="tabular grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
                  <dt className="text-fg-subtle">Total</dt>
                  <dd className="font-medium text-fg">
                    {formatMoney(row.totalRevenue)}
                  </dd>
                  <dt className="text-fg-subtle">Matured</dt>
                  <dd className="font-medium text-fg">
                    {formatCount(row.maturedSample)} of{" "}
                    {formatCount(row.assignedOpportunities)}
                  </dd>
                  <dt className="text-fg-subtle">Attended</dt>
                  <dd className="font-medium text-fg">
                    {formatCount(row.attendedAppointments)}
                  </dd>
                  <dt className="text-fg-subtle">Wins</dt>
                  <dd className="font-medium text-fg">
                    {formatCount(row.wins)}
                  </dd>
                  <dt className="text-fg-subtle">Refunds</dt>
                  <dd className="font-medium text-fg">
                    {formatCount(row.refundCount)}
                  </dd>
                  <dt className="text-fg-subtle">Prior</dt>
                  <dd className="font-medium text-fg">
                    {row.priorPeriodRevenuePerLead === undefined
                      ? "Not set"
                      : perLead(row.priorPeriodRevenuePerLead, currency)}
                  </dd>
                </dl>
                {correctionSent ? (
                  <span className="inline-flex h-8 items-center gap-1.5 text-[13px] text-perf-strong">
                    <CheckCircle size={15} weight="bold" aria-hidden />
                    Sent for review
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRequestCorrection}
                    className="-ml-3 self-start"
                  >
                    Request correction
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}
