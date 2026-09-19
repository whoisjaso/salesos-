"use client";

import { useState } from "react";
import { CaretRight, Pause } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import type { GameView } from "@/lib/workspace-game";

/**
 * One line under the hero, only while the quality gate is paused (SOS-15). It is state that
 * changes what the rep does next, so it earns its place on the screen; the reasons sit behind
 * the tap. When the gate is open, nothing renders: level, streak and mission live on Me.
 */
export function GateLine({ game }: { game: GameView }) {
  const [open, setOpen] = useState(false);
  const { gate } = game.player;
  if (!gate.paused) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-10 w-full items-center gap-2 px-1 text-left text-[14px] text-fg-muted hover:text-fg" data-testid="gate-line">
        <Pause size={14} weight="bold" aria-hidden className="shrink-0" />
        <span className="flex-1">XP paused</span>
        <CaretRight size={14} weight="bold" aria-hidden className="text-fg-subtle" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="XP paused" description="Quality gate">
        <ul className="flex flex-col gap-2 text-[14px] leading-snug text-fg">
          {gate.reasons.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <Pause size={14} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-fg-subtle" />
              {r}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-fg-subtle">Resolve these and XP counts again. Nothing is lost.</p>
      </Sheet>
    </>
  );
}
