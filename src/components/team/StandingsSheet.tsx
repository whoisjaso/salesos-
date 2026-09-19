"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle, Hourglass } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import type { Standings } from "@/domain/leaderboard";
import { SURFACE_LABEL, incidentsForSurface } from "@/domain/incidents";
import type { StandingsLines } from "@/lib/team-data";
import { Switch } from "./Segmented";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 first:pt-0">
      <dt className="text-[13px] font-medium text-fg-muted">{label}</dt>
      <dd className="tabular text-[13.5px] leading-relaxed text-fg">{children}</dd>
    </div>
  );
}

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
        {held ? (
          <dl className="flex flex-col divide-y divide-line">
            <Row label="What is held">
              <span className="flex items-start gap-1.5">
                <Hourglass size={13} weight="bold" aria-hidden className="mt-1 shrink-0 text-fg-subtle" />
                <span>{SURFACE_LABEL[held.surface]}, so no position is produced anywhere</span>
              </span>
            </Row>
            <Row label="Waits until">{held.waitingOn}</Row>
            <Row label="Owner">{held.ownerLabel ?? "The owner"}</Row>
            <Row label="Open now">
              <span className="flex flex-col gap-2">
                {incidents.map((i) => (
                  <span key={i.incidentId} className="flex flex-col gap-0.5">
                    <span className="tabular font-medium">{i.title}</span>
                    <span className="text-[12px] leading-snug text-fg-muted">{i.effect}</span>
                  </span>
                ))}
              </span>
            </Row>
          </dl>
        ) : (
          <p className="flex items-start gap-2 text-[14px] leading-relaxed text-fg">
            <Hourglass size={16} weight="bold" aria-hidden className="mt-1 shrink-0 text-fg-muted" />
            <span className="tabular">{lines.holdLine ?? lines.orderLine}</span>
          </p>
        )}

        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-fg-muted">
          <CheckCircle size={15} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
          <span>Nothing else is held: every figure on the board is shown as it stands, and calling, appointments, and conversation coaching are untouched.</span>
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
