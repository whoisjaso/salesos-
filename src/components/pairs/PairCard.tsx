"use client";

import { Hourglass } from "@phosphor-icons/react";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { formatMoneyMinor } from "@/lib/format";
import { CHOSEN_BY_LABEL, initials, pairTitle, type PairView } from "@/lib/team-data";
import { PAIR_HUE, PairBar } from "./PairBar";

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
    <span className={cn("inline-flex shrink-0 items-center", className)} style={{ width: size * 1.7, height: size }}>
      <span className="relative block" style={{ width: size * 1.7, height: size }}>
        <span className="absolute left-0 top-0">{circle(setterDisplayName, "setter", "z-0")}</span>
        <span className="absolute top-0" style={{ left: size * 0.7 }}>
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

/** One pair on the board: avatars, names, chosen-by tag, one number with its basis, the pair bar. Tap opens the sheet. */
export function PairCard({ view, onOpen, meId, className }: PairCardProps) {
  const { pair, row, setterDisplayName, closerDisplayName, funnel, diagnostic } = view;
  const title = pairTitle(setterDisplayName, closerDisplayName);
  const currency = row?.currency ?? view.contribution.currency;
  const value = row?.netPerAssigned.value ?? null;
  const meSide = meId === pair.setterUserId ? "setter" : meId === pair.closerUserId ? "closer" : undefined;

  return (
    <Surface as="li" padding="none" className={cn("list-none", className)}>
      <button type="button" onClick={() => onOpen(view)} aria-label={`${title}, open pair`} className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-hover motion-reduce:transition-none sm:p-5">
        <span className="flex items-center gap-3">
          <PairAvatars setterDisplayName={setterDisplayName} closerDisplayName={closerDisplayName} meSide={meSide} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-[15px] font-semibold leading-tight text-fg">{title}</span>
              <span className="tag text-fg-muted">{CHOSEN_BY_LABEL[pair.chosenBy]}</span>
            </span>
            <span className="truncate text-[12px] text-fg-subtle">
              {setterDisplayName} sets, {closerDisplayName} closes
            </span>
          </span>
          {row?.rank !== null && row?.rank !== undefined ? (
            <span className="tabular shrink-0 text-[13px] font-medium text-fg-subtle">#{row.rank}</span>
          ) : (
            <span aria-label="Provisional" title={row?.provisionalReason ?? "No opportunities in the season yet"} className="tag text-fg-muted">
              <Hourglass size={10} weight="bold" aria-hidden />
              Provisional
            </span>
          )}
        </span>

        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="tabular text-[24px] font-semibold leading-none tracking-tight text-fg">{value === null ? "N/A" : formatMoneyMinor(Math.round(value), currency, { cents: true })}</span>
          <span className="chip text-fg-muted">Net collected cash</span>
          <span className="tabular text-[12px] text-fg-subtle">per assigned, {row?.assignedOpportunities ?? 0} assigned</span>
        </span>

        <PairBar funnel={funnel} diagnostic={diagnostic} />
      </button>
    </Surface>
  );
}
