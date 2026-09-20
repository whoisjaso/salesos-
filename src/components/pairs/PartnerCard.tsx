"use client";

import { CaretRight, UsersThree } from "@phosphor-icons/react";
import { Surface } from "@/components/ui/Surface";
import { formatMoneyMinor } from "@/lib/format";
import { CHOSEN_BY_LABEL, initials, type PairView } from "@/lib/team-data";
import { PAIR_HUE, PairBar } from "./PairBar";

export interface PartnerCardProps {
  /** The rep's active pair, or null for the quiet "No pair yet" row. */
  view: PairView | null;
  /** The session rep's id: the partner is the other person. */
  meId: string;
  onOpen: (view: PairView) => void;
}

/** Rep Me: who I run with, the pair's one number, and the pair bar. Tap opens the pair sheet. */
export function PartnerCard({ view, meId, onOpen }: PartnerCardProps) {
  if (!view) {
    return (
      <Surface padding="none" as="section" aria-label="Partner" className="flex h-14 items-center gap-3 px-4">
        <UsersThree size={18} weight="regular" aria-hidden className="shrink-0 text-fg-subtle" />
        <span className="flex-1 text-[15px] font-medium text-fg-muted">No pair yet</span>
      </Surface>
    );
  }
  const { pair, row, setterDisplayName, closerDisplayName, funnel, diagnostic, contribution } = view;
  const partnerSide = meId === pair.setterUserId ? "closer" : "setter";
  const partnerName = partnerSide === "closer" ? closerDisplayName : setterDisplayName;
  const currency = row?.currency ?? contribution.currency;
  const value = row?.netPerAssigned.value ?? null;

  return (
    <Surface padding="none" as="section" aria-label="Partner">
      <button type="button" onClick={() => onOpen(view)} className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-hover motion-reduce:transition-none sm:p-5">
        <span className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-[12.5px] font-semibold text-fg-muted"
            style={{ boxShadow: `0 0 0 2px var(--bg-raised), 0 0 0 3px ${PAIR_HUE[partnerSide]}` }}
          >
            {initials(partnerName)}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[15px] font-semibold leading-tight text-fg">Runs with {partnerName}</span>
            <span className="tag text-fg-muted">{CHOSEN_BY_LABEL[pair.chosenBy]}</span>
          </span>
          <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
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
