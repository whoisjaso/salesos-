"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretDown, CheckCircle, HourglassMedium } from "@phosphor-icons/react";
import type { FunnelStage, LeaderboardRow as Row } from "@/domain/types";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { formatBasis, formatCount, formatMoney, formatMoneyMinor } from "@/lib/format";

export interface LeaderboardRowProps {
  row: Row;
  /** Ranks rebuilt without the pause; shown, but labeled descriptive. */
  descriptive?: boolean;
  /** Hide the rank cell entirely (personal progress view). */
  hideRank?: boolean;
  funnel: FunnelStage[];
  correctionSent: boolean;
  onRequestCorrection: () => void;
}

function perLead(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "N/A";
  return formatMoneyMinor(Math.round(value), currency, { cents: true });
}

/** One rep. Tap anywhere on the row to reveal the funnel, prior period, and the correction request. */
export function LeaderboardRow({ row, descriptive = false, hideRank = false, funnel, correctionSent, onRequestCorrection }: LeaderboardRowProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const currency = row.revenuePerLead.currency ?? row.totalRevenue.currency;
  const panelId = `row-${row.userId}-${row.role}-detail`;

  return (
    <motion.li layout={!reduce} className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 py-3.5 text-left hover:bg-hover sm:gap-4"
      >
        {hideRank ? null : (
          <div className="flex w-14 shrink-0 flex-col items-start pt-0.5 sm:w-16">
            {row.rank !== null ? (
              <>
                <span className="tabular text-[22px] font-semibold leading-none tracking-tight text-fg">{row.rank}</span>
                {descriptive ? <span className="mt-1 text-[10.5px] font-medium text-fg-subtle">descriptive</span> : null}
              </>
            ) : (
              <Tooltip content={row.provisionalReason ?? "Provisional"}>
                <span
                  className="inline-flex h-6 items-center gap-1 rounded-sm border border-dashed border-line-strong px-1.5 text-[11px] font-medium text-fg-muted"
                  tabIndex={0}
                  onClick={(e) => e.stopPropagation()}
                >
                  <HourglassMedium size={12} weight="bold" aria-hidden />
                  Provisional
                </span>
              </Tooltip>
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-[15px] font-semibold text-fg">{row.displayName}</span>
                {row.leadTier !== undefined ? (
                  <span className="inline-flex h-5 items-center rounded-[4px] border border-line-strong px-1.5 text-[11px] font-medium text-fg-muted">
                    Tier {row.leadTier}
                  </span>
                ) : null}
              </div>
              <div className="tabular mt-1 text-[12.5px] text-fg-subtle">
                {formatMoney(row.totalRevenue)} total
                <span className="text-fg-faint"> · </span>
                {formatCount(row.maturedSample)} of {formatCount(row.assignedOpportunities)} matured
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="tabular text-[17px] font-semibold leading-none tracking-tight text-fg">{perLead(row.revenuePerLead.value, currency)}</div>
              <div className="mt-1.5 flex justify-end">
                <span className="inline-flex h-5 items-center whitespace-nowrap rounded-[4px] bg-accent-soft px-1.5 text-[10.5px] font-medium text-accent">
                  {formatBasis(row.basis)} per lead
                </span>
              </div>
            </div>
          </div>

          <div className="tabular mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-fg-muted">
            <span>{formatCount(row.attendedAppointments)} attended</span>
            <span>{formatCount(row.wins)} {row.wins === 1 ? "win" : "wins"}</span>
            <span>{formatCount(row.refundCount)} {row.refundCount === 1 ? "refund" : "refunds"}</span>
          </div>
          {row.movementReason ? <p className="mt-1.5 line-clamp-1 text-[12px] leading-snug text-fg-subtle">{row.movementReason}</p> : null}
        </div>

        <CaretDown
          size={14}
          weight="bold"
          aria-hidden
          className={cn("mt-1 shrink-0 text-fg-faint transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
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
            <div className={cn("grid grid-cols-1 gap-5 pb-4 sm:grid-cols-[minmax(0,1fr)_240px]", hideRank ? "" : "pl-0 sm:pl-20")}>
              <div>
                <div className="mb-2 text-[12px] font-medium text-fg-subtle">Funnel, this rep</div>
                <MiniFunnelLazy stages={funnel} />
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[12px] font-medium text-fg-subtle">Prior period</div>
                  <div className="tabular mt-0.5 text-[15px] font-semibold text-fg">
                    {row.priorPeriodRevenuePerLead === undefined ? "Not configured" : perLead(row.priorPeriodRevenuePerLead, currency)}
                  </div>
                  <div className="text-[11.5px] text-fg-subtle">{formatBasis(row.basis)} per lead</div>
                </div>
                {row.provisionalReason ? <p className="text-[12px] leading-snug text-fg-muted">{row.provisionalReason}</p> : null}
                <div>
                  {correctionSent ? (
                    <span className="inline-flex h-8 items-center gap-1.5 text-[13px] text-perf-strong">
                      <CheckCircle size={15} weight="bold" aria-hidden />
                      Sent for review
                    </span>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={onRequestCorrection} className="-ml-3">
                      Request correction
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

import { MiniFunnel } from "./MiniFunnel";

function MiniFunnelLazy({ stages }: { stages: FunnelStage[] }) {
  return <MiniFunnel stages={stages} />;
}
