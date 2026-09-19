"use client";

import Link from "next/link";
import { CheckCircle, Hourglass } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import type { Standings } from "@/domain/leaderboard";
import { incidentsForSurface } from "@/domain/incidents";
import type { StandingsLines } from "@/lib/team-data";
import { Switch } from "./Segmented";

export interface StandingsSheetProps {
  open: boolean;
  onClose: () => void;
  /** The standings as the policy really stands, so the hold survives the override. */
  standings: Standings;
  lines: StandingsLines;
  descriptive: boolean;
  onDescriptive: (next: boolean) => void;
  /** The owner can fix the data from Business; reps only see the reasons. */
  isOwner: boolean;
}

/**
 * Why this list is a roster: the scoped hold, in its own words. Never a global
 * pause ("A held measurement never holds the person", docs/DECISIONS.md): the
 * hold names one surface, what it waits on, who owns it, and what keeps running.
 */
export function StandingsSheet({ open, onClose, standings, lines, descriptive, onDescriptive, isOwner }: StandingsSheetProps) {
  const held = standings.heldBy;
  const incidents = held ? incidentsForSurface(standings.scope, held.surface) : [];

  return (
    <Sheet open={open} onClose={onClose} title={lines.holdLabel} description={held ? held.ownerLabel ?? "Owned elsewhere" : "Not enough matured work yet"}>
      <div className="flex flex-col gap-5">
        <p className="flex items-start gap-2 text-[14px] leading-relaxed text-fg">
          <Hourglass size={16} weight="bold" aria-hidden className="mt-1 shrink-0 text-fg-muted" />
          <span className="tabular">{held ? held.statement : lines.holdLine ?? lines.orderLine}</span>
        </p>

        {held ? (
          <dl className="flex flex-col divide-y divide-line">
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 first:pt-0">
              <dt className="text-[13px] font-medium text-fg-muted">Waits until</dt>
              <dd className="tabular text-[13.5px] leading-relaxed text-fg">{held.waitingOn}</dd>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5">
              <dt className="text-[13px] font-medium text-fg-muted">Owner</dt>
              <dd className="text-[13.5px] leading-relaxed text-fg">{held.ownerLabel ?? "The owner"}</dd>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5">
              <dt className="text-[13px] font-medium text-fg-muted">Open now</dt>
              <dd className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-fg">
                {incidents.map((i) => (
                  <span key={i.incidentId} className="flex flex-col gap-0.5">
                    <span className="tabular font-medium">{i.title}</span>
                    <span className="text-[12px] leading-snug text-fg-muted">{i.effect}</span>
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        ) : null}

        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-fg-muted">
          <CheckCircle size={15} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
          <span>Everything else keeps running: the figures below are shown as they stand, and calling, appointments, and conversation coaching are untouched.</span>
        </p>

        <div className="surface flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-fg">Show ranks anyway</div>
            <div className="text-[12px] text-fg-subtle">Descriptive only, not a standing</div>
          </div>
          <Switch checked={descriptive} onChange={onDescriptive} label="Show ranks anyway" className="shrink-0 [&>span:last-child]:sr-only" />
        </div>

        {isOwner ? (
          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-sm bg-accent px-4 text-[15px] font-medium text-accent-fg hover:bg-accent-strong">
            Fix in Business
          </Link>
        ) : (
          <p className="text-[12px] text-fg-subtle">{held ? `${held.ownerLabel ?? "The owner"} resolves this. Your own work is not held.` : "Nothing here is yours to fix. Your own work is not held."}</p>
        )}
      </div>
    </Sheet>
  );
}
