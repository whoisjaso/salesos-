"use client";

import { CaretRight, Warning, WarningOctagon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { formatMoneyMinor } from "@/lib/format";
import { initials, pairTitle, type PairView } from "@/lib/team-data";
import { PAIR_HUE } from "./PairBar";

export interface PairAvatarsProps {
  setterDisplayName: string;
  closerDisplayName: string;
  size?: number;
  /** Which circle carries the session user's accent fill. */
  meSide?: "setter" | "closer";
  className?: string;
}

/**
 * Two initials circles, setter behind, closer overlapping in front. Each ring
 * carries its side's hue. Local for now: a shared Avatar component is coming
 * and will replace the circles; the shape of this component stays.
 */
export function PairAvatars({ setterDisplayName, closerDisplayName, size = 36, meSide, className }: PairAvatarsProps) {
  const circle = (name: string, side: "setter" | "closer", z: string) => (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", z, meSide === side ? "bg-accent text-accent-fg" : "bg-sunken text-fg-muted")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.35), boxShadow: `0 0 0 2px var(--bg-raised), 0 0 0 3px ${PAIR_HUE[side]}` }}
    >
      {initials(name)}
    </span>
  );
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)} style={{ width: size * 1.8, height: size }}>
      <span className="relative block" style={{ width: size * 1.8, height: size }}>
        <span className="absolute left-0 top-0">{circle(setterDisplayName, "setter", "z-0")}</span>
        <span className="absolute top-0" style={{ left: size * 0.8 }}>
          {circle(closerDisplayName, "closer", "z-10")}
        </span>
      </span>
    </span>
  );
}

export interface PairCardProps {
  view: PairView;
  onOpen: (view: PairView) => void;
  /** The session user's id, so their circle carries the accent. */
  meId?: string | null;
  className?: string;
}

/** Gap at or past this many ratio points is an issue; a smaller gap needs attention. */
const ISSUE_GAP = 0.15;

/**
 * One pair on the board: the two avatars, the two first names, one number
 * (net collected per assigned), and one status word when the diagnostic flags a
 * side. The pair bar, chosen-by, and the full diagnostic live in the sheet.
 */
export function PairCard({ view, onOpen, meId, className }: PairCardProps) {
  const { pair, row, setterDisplayName, closerDisplayName, diagnostic } = view;
  const title = pairTitle(setterDisplayName, closerDisplayName);
  const currency = row?.currency ?? view.contribution.currency;
  const value = row?.netPerAssigned.value ?? null;
  const meSide = meId === pair.setterUserId ? "setter" : meId === pair.closerUserId ? "closer" : undefined;
  const flagged = diagnostic.weakestSide !== "none";
  const issue = flagged && diagnostic.gap <= -ISSUE_GAP;
  const StatusIcon = issue ? WarningOctagon : Warning;

  return (
    <li className={cn("border-b border-line last:border-b-0", className)}>
      <button type="button" onClick={() => onOpen(view)} aria-label={`${title}, open pair`} className="flex min-h-16 w-full items-center gap-3 py-2.5 text-left hover:bg-hover active:bg-hover">
        <PairAvatars setterDisplayName={setterDisplayName} closerDisplayName={closerDisplayName} meSide={meSide} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-medium leading-tight text-fg">{title}</span>
          {flagged ? (
            <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium leading-tight", issue ? "text-perf-issue" : "text-perf-attention")}>
              <StatusIcon size={12} weight="bold" aria-hidden />
              Behind
            </span>
          ) : null}
        </span>
        <span className="tabular shrink-0 text-[17px] font-semibold leading-none tracking-tight text-fg">{value === null ? "N/A" : formatMoneyMinor(Math.round(value), currency, { cents: true })}</span>
        <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
      </button>
    </li>
  );
}
