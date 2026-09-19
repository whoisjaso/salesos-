"use client";

import { useState } from "react";
import { CaretRight, Hourglass } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { XP_TABLE, type GameTrack } from "@/domain/game";
import { holdFor } from "@/domain/incidents";
import { Fields } from "./Fields";
import type { GameView } from "@/lib/workspace-game";

const TRACK_LABEL: Record<GameTrack, string> = {
  commercial: "Selling XP",
  mastery: "Practice XP",
  team: "Team XP",
};

/**
 * One quiet line under the hero, and only when a specific XP track is waiting on a
 * measurement (docs/DECISIONS.md, "A held measurement never holds the person").
 *
 * A data incident holds the XP kinds that rest on the surface it makes unreliable and
 * nothing else, so this line names that track and what it waits on. It never says
 * progress is paused, because it is not: the level, the streak and every other verified
 * event keep running. The owner, the action and what keeps accruing sit behind the tap.
 * With nothing held, nothing renders.
 */
export function GateLine({ game }: { game: GameView }) {
  const [open, setOpen] = useState(false);
  const { gate, scope } = game.player;
  const hold = gate.holds[0];
  if (!hold) return null;

  const status = holdFor(scope, hold.surfaces);
  const track = TRACK_LABEL[hold.track];
  const waiting = hold.held.map((k) => XP_TABLE[k].label).join(" and ");
  const keeps = hold.accruing.map((k) => XP_TABLE[k].label).join(", ");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mx-1 flex w-full items-start gap-2 rounded-sm px-1 py-1.5 text-left hover:bg-hover"
        data-testid="gate-line"
      >
        <Hourglass size={13} weight="bold" aria-hidden className="mt-[3px] shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-muted">
          {track}: {waiting} waits on {status?.waitingOn ?? hold.statement}. {status?.ownerLabel ?? "Sales ops"} owns it.
        </span>
        <CaretRight size={12} weight="bold" aria-hidden className="mt-[3px] shrink-0 text-fg-subtle" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={track} description={`${waiting} is waiting`}>
        <p className="mb-3 text-[14px] leading-snug text-fg">{hold.statement}</p>
        <Fields
          items={[
            { label: "Waiting on", value: status?.waitingOn ?? hold.statement },
            { label: "Who resolves it", value: status?.ownerLabel ?? "Sales ops" },
            { label: "Action", value: status?.action ?? "resolve the measurement this rests on" },
            { label: "Still accruing", value: keeps || "Every other track" },
            { label: "Your level and streak", value: "Untouched. Nothing you earned is removed." },
          ]}
        />
      </Sheet>
    </>
  );
}
