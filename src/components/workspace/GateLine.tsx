"use client";

import { useState } from "react";
import { CaretRight, Hourglass } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { XP_TABLE, type GameEventKind, type GameTrack } from "@/domain/game";
import { holdFor, type SurfaceStatus } from "@/domain/incidents";
import { Fields } from "./Fields";
import type { GameView } from "@/lib/workspace-game";

const TRACK_LABEL: Record<GameTrack, string> = {
  commercial: "Selling XP",
  mastery: "Practice XP",
  team: "Team XP",
};

/** Our own short word for an XP kind that can wait on a measurement. */
const HOLD_WORD: Partial<Record<GameEventKind, string>> = {
  attended_show: "Show",
  cash_collected: "Cash",
};

function holdWords(kinds: GameEventKind[]): string {
  const words = kinds.map((k) => HOLD_WORD[k] ?? XP_TABLE[k].label);
  if (words.length <= 1) return words[0] ?? "Some";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1].toLowerCase()}`;
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Why this XP is waiting, in our words, from the surface's own state. */
function reasonFor(status: SurfaceStatus | null): string {
  if (!status) return "a measurement it rests on is not settled";
  return `the ${status.label.toLowerCase()} ${status.disposition === "withheld" ? "is not established yet" : "is provisional"}`;
}

/**
 * One short line under the hero, and only when a specific kind of XP is waiting on a
 * measurement (docs/DECISIONS.md, "A held measurement never holds the person").
 *
 * A data incident holds the XP kinds that rest on the surface it makes unreliable and
 * nothing else, so the line names those kinds and nothing more. It never says progress
 * is paused, because it is not: the level, the streak and every other verified event
 * keep running. The whole sentence, what lifts it, who owns it and what keeps accruing
 * sit behind the tap. With nothing held, nothing renders.
 */
export function GateLine({ game }: { game: GameView }) {
  const [open, setOpen] = useState(false);
  const { gate, scope } = game.player;
  const hold = gate.holds[0];
  if (!hold) return null;

  const status = holdFor(scope, hold.surfaces);
  const waiting = holdWords(hold.held);
  const line = `${waiting} XP on hold`;
  const keeps = hold.accruing.map((k) => XP_TABLE[k].label).join(", ");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mx-1 flex h-9 w-full items-center gap-2 rounded-sm px-1 text-left hover:bg-hover"
        data-testid="gate-line"
      >
        <Hourglass size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{line}</span>
        <CaretRight size={12} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={line} description={TRACK_LABEL[hold.track]}>
        <p className="mb-3 text-[14px] leading-snug text-fg">
          {waiting} XP is on hold because {reasonFor(status)}. Your level, your streak and every other kind of XP keep counting.
        </p>
        <Fields
          items={[
            { label: "Lifts when", value: upperFirst(status?.waitingOn ?? "the measurement behind it is settled") },
            { label: "Who resolves it", value: status?.ownerLabel ?? "Sales ops" },
            { label: "What they do", value: upperFirst(status?.action ?? "resolve the measurement this rests on") },
            { label: "Still counting", value: keeps || "Every other kind of XP" },
            { label: "Already earned", value: "Kept. Nothing is removed and nothing is lost." },
          ]}
        />
      </Sheet>
    </>
  );
}
