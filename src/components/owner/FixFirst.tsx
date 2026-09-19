"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import type { BottleneckCard, CoachingOwner } from "@/domain/types";
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { BottleneckCardView } from "./BottleneckCardView";

export interface FixFirstProps {
  cards: BottleneckCard[];
  cohortLabel: string;
}

/** Exactly one card above the fold; the rest behind "See all". Assignment is client state only. */
export function FixFirst({ cards, cohortLabel }: FixFirstProps) {
  const [allOpen, setAllOpen] = useState(false);
  const [owners, setOwners] = useState<Record<string, CoachingOwner>>({});
  const ownerOf = (card: BottleneckCard) => owners[card.cardId] ?? card.responsibleFunction;
  const assign = (card: BottleneckCard) => (owner: CoachingOwner) => setOwners((prev) => ({ ...prev, [card.cardId]: owner }));

  const [first, ...rest] = cards;

  return (
    <section aria-labelledby="fix-first-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="fix-first-heading" className="text-[13px] font-medium text-fg-subtle">
          Fix this first
        </h2>
        {rest.length > 0 ? (
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
          >
            See all {cards.length}
            <ArrowRight size={13} weight="bold" aria-hidden />
          </button>
        ) : null}
      </div>

      {first ? (
        <BottleneckCardView card={first} owner={ownerOf(first)} onAssign={assign(first)} />
      ) : (
        <Surface state="strong" padding="md" className="flex items-center gap-3 text-[14px] text-fg">
          <CheckCircle size={20} weight="bold" aria-hidden className="text-perf-strong" />
          Nothing flagged
        </Surface>
      )}

      <Sheet open={allOpen} onClose={() => setAllOpen(false)} title="All investigations" description={cohortLabel} width={520}>
        <div className="flex flex-col gap-3">
          {cards.map((card) => (
            <BottleneckCardView key={card.cardId} card={card} owner={ownerOf(card)} onAssign={assign(card)} />
          ))}
        </div>
      </Sheet>
    </section>
  );
}
