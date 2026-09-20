"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CaretRight, ChatsCircle, Hourglass, MagnifyingGlass, SealCheck } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/Sheet";
import { Fields } from "@/components/workspace/Fields";
import { cn } from "@/lib/cn";
import type { TodayCount, TodayCountId, TodayFocus as TodayFocusModel, TodayHeldNote } from "./today-focus";

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const COUNT_ICON: Record<TodayCountId, ComponentType<IconProps>> = {
  conversations: ChatsCircle,
  bookings: CalendarCheck,
  attended: SealCheck,
};

/**
 * The strip's own name. It deliberately avoids the word Today, which already names the
 * list of today's appointments on the closer screen; two regions with the same name are
 * two things a screen reader reads the same way.
 */
export const PROGRESS_LABEL = "Progress so far";
export const IMPROVEMENT_LABEL = "Next improvement";
export const EMPTY_PROGRESS_LINE = "Nothing verified yet today. Your first call starts it.";

/**
 * The Today secondary area: one strip under the hero and the list, never a card stack.
 * Today's verified progress during the day, the single next improvement once a call has
 * been reviewed, and at most one quiet note for coaching that is waiting on data.
 * See src/components/home/today-focus.ts for the rule that picks between them.
 *
 * It is a strip and not a card on purpose: it carries three figures, and the rule that
 * no card holds more than one number holds cards to one. Nothing here is bordered and
 * nothing here is a tile; the only bordered things on this screen stay tappable.
 */
export function TodayFocus({ focus, className }: { focus: TodayFocusModel; className?: string }) {
  const wrapper = cn("flex flex-col gap-2.5 border-t border-line pt-3", className);

  if (focus.kind === "improvement") {
    const { improvement } = focus;
    return (
      <section aria-label={IMPROVEMENT_LABEL} data-testid="today-focus" data-focus="improvement" className={wrapper}>
        <span className="section-label">{IMPROVEMENT_LABEL}</span>
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-fg-muted" data-testid="improvement-label">
            {improvement.label}
          </span>
          <p className="text-[15px] leading-snug text-fg" data-testid="improvement-sentence">
            {improvement.sentence}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={improvement.href}
            data-testid="improvement-link"
            className="inline-flex h-8 items-center gap-1.5 text-[13px] font-medium text-accent underline-offset-2 hover:underline"
          >
            <MagnifyingGlass size={14} weight="bold" aria-hidden />
            Open the moment at {improvement.at}
          </Link>
          <span className="text-[12px] text-fg-subtle">{improvement.source}</span>
        </div>
        {focus.held ? <HeldNote note={focus.held} /> : null}
      </section>
    );
  }

  return (
    <section aria-label={PROGRESS_LABEL} data-testid="today-focus" data-focus="progress" className={wrapper}>
      <span className="section-label">{PROGRESS_LABEL}</span>
      {focus.counts.length === 0 ? (
        <p className="text-[13px] leading-snug text-fg-muted">{EMPTY_PROGRESS_LINE}</p>
      ) : (
        <ul className="flex flex-wrap items-start gap-x-6 gap-y-3">
          {focus.counts.map((count) => (
            <CountItem key={count.id} count={count} />
          ))}
        </ul>
      )}
      {focus.held ? <HeldNote note={focus.held} /> : null}
    </section>
  );
}

/** One verified count: the figure, the word it carries, and what it counts over what period. */
function CountItem({ count }: { count: TodayCount }) {
  const Icon = COUNT_ICON[count.id];
  const bounded = count.atLeast && count.value > 0;
  return (
    <li className="flex min-w-[124px] flex-1 flex-col gap-1" data-testid="today-count" data-count={count.id}>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <Icon size={14} weight="bold" aria-hidden className="shrink-0 translate-y-[1px] text-fg-subtle" />
        {bounded ? <span className="text-[12px] font-medium text-fg-muted">At least</span> : null}
        <span className="tabular text-[20px] font-semibold leading-none tracking-tight text-fg">{count.value}</span>
        <span className="text-[13px] text-fg">{count.word}</span>
      </span>
      <span className="text-[11.5px] leading-snug text-fg-subtle">{count.counts}</span>
    </li>
  );
}

/**
 * Coaching that is waiting on a data incident. It never replaces valid coaching and never
 * carries a figure: one line saying what it waits on and who owns it, the rest on tap.
 */
function HeldNote({ note }: { note: TodayHeldNote }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="today-held"
        className="-mx-1 flex h-9 w-full items-center gap-2 rounded-sm px-1 text-left hover:bg-hover"
      >
        <Hourglass size={13} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">One more waits on data</span>
        <CaretRight size={12} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="One more waits on data" description={note.title}>
        <p className="mb-3 text-[14px] leading-snug text-fg">
          One more thing to work on is held until the numbers behind it are settled: {note.title.toLowerCase()}. {note.ownerLabel} resolves it, and coaching read from
          your conversations is unaffected.
        </p>
        <Fields
          items={[
            { label: "Lifts when", value: upperFirst(note.waitingOn) },
            { label: "Who resolves it", value: note.ownerLabel },
            { label: "What they do", value: upperFirst(note.action) },
            { label: "What keeps running", value: "Calling, appointments, and coaching read from your conversations." },
          ]}
        />
      </Sheet>
    </>
  );
}
