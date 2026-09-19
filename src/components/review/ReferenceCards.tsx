"use client";

import { useMemo, useState, type ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { ChatCircleText, CheckCircle, Eye, HandPointing, Lightbulb, Question, PushPin, Prohibit, Users, UsersThree } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import type { TranscriptSpan } from "@/domain/callIntelligence";
import { vocabulary as vocabularyOf, type VocabularyEntry } from "@/domain/references";
import { cn } from "@/lib/cn";
import type { ReferenceView } from "@/lib/review";

/** Origin as a word plus an icon, never color alone (SOS-20). */
const ORIGIN_ICON: Record<string, ComponentType<IconProps>> = {
  Spontaneous: ChatCircleText,
  Prompted: HandPointing,
  Shared: Users,
  "Third party": UsersThree,
  Unknown: Question,
};

const MEANING_ICON: Record<string, ComponentType<IconProps>> = {
  Observed: Eye,
  Inferred: Lightbulb,
  Confirmed: CheckCircle,
  Unknown: Question,
};

/** A card view with the optional weighting the parent may supply. Missing fields keep the parent's order and hide the count tag. */
export type ReferenceCardView = ReferenceView & {
  /** Customer occurrences merged into this reference. The tag shows only above 1. */
  occurrenceCount?: number;
  /** `significance(reference)` from src/domain/references.ts; cards order by it, highest first. */
  significance?: number;
};

export interface ReferenceCardsProps {
  references: ReferenceCardView[];
  pinned: ReadonlySet<string>;
  rejected: ReadonlySet<string>;
  onJump: (spanIndex: number) => void;
  onPin: (referenceId: string) => void;
  onReject: (referenceId: string) => void;
  /** Their vocabulary, precomputed. When absent it is derived from `transcript`; when both are absent the row is hidden. */
  vocabulary?: VocabularyEntry[];
  transcript?: TranscriptSpan[];
  /** Highlight every span a vocabulary chip cites. A no-op when the parent does not expose one. */
  onSelectSpans?: (spans: TranscriptSpan[]) => void;
}

const MAX_CHIPS = 6;

/** Stable: equal significance keeps the given order. Cards without a significance keep their place among themselves. */
function bySignificance(references: ReferenceCardView[]): ReferenceCardView[] {
  return references
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.significance ?? 0) - (a.r.significance ?? 0) || a.i - b.i)
    .map((x) => x.r);
}

/**
 * Their words. One card per reference, ordered by significance: the exact expression large, a
 * tiny count tag when the prospect said it more than once, one meaning line, a tiny origin word
 * and meaning-status word, Use later (pin) and Not this (stop reuse). Tapping the expression goes
 * to the cited span. Under the cards, their vocabulary as count chips; a tap highlights every span.
 * Pinning protects position; it never certifies accuracy.
 */
export function ReferenceCards({ references, pinned, rejected, onJump, onPin, onReject, vocabulary, transcript, onSelectSpans }: ReferenceCardsProps) {
  const ordered = useMemo(() => bySignificance(references), [references]);
  const chips = useMemo(() => (vocabulary ?? (transcript ? vocabularyOf(transcript) : [])).slice(0, MAX_CHIPS), [vocabulary, transcript]);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const select = (entry: VocabularyEntry) => {
    setSelectedTerm(entry.term);
    onSelectSpans?.(entry.spans);
  };

  if (ordered.length === 0 && chips.length === 0) return <span className="text-[13px] text-fg-subtle">Nothing distinctive yet</span>;
  return (
    <div className="flex flex-col gap-3">
      {ordered.length === 0 ? (
        <span className="text-[13px] text-fg-subtle">Nothing distinctive yet</span>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Their words">
          {ordered.map((r) => {
            const isPinned = pinned.has(r.referenceId);
            const isRejected = rejected.has(r.referenceId);
            const OriginIcon = ORIGIN_ICON[r.originWord] ?? Question;
            const MeaningIcon = MEANING_ICON[r.meaningWord] ?? Question;
            const count = r.occurrenceCount ?? 1;
            return (
              <li key={r.referenceId} className={cn("flex flex-col gap-1.5", isRejected && "opacity-60")} data-testid="reference-card" data-rejected={isRejected ? "true" : undefined} data-pinned={isPinned ? "true" : undefined} data-significance={r.significance}>
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => onJump(r.spanIndex)} className="rounded-sm text-left text-[17px] font-semibold leading-snug text-fg hover:text-accent" aria-label={`${r.expression}, see moment`} data-testid="reference-expression">
                    &ldquo;{r.expression}&rdquo;
                  </button>
                  {count > 1 ? (
                    <span className="mt-1 shrink-0 text-[11px] font-medium tabular-nums text-fg-subtle" aria-label={`said ${count} times`} data-testid="reference-count">
                      &times;{count}
                    </span>
                  ) : null}
                </div>
                <p className="text-[13px] leading-snug text-fg-muted">{r.meaning}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
                  <span className="inline-flex items-center gap-1">
                    <OriginIcon size={11} weight="bold" aria-hidden />
                    {r.originWord}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MeaningIcon size={11} weight="bold" aria-hidden />
                    {r.meaningWord}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-0.5">
                    <Button variant="ghost" size="sm" onClick={() => onPin(r.referenceId)} aria-pressed={isPinned} disabled={isRejected} leading={<PushPin size={13} weight={isPinned ? "fill" : "bold"} />} className={cn("h-7 px-2 text-[12px]", isPinned && "text-accent")}>
                      {isPinned ? "Kept" : "Use later"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onReject(r.referenceId)} aria-pressed={isRejected} leading={<Prohibit size={13} weight="bold" />} className="h-7 px-2 text-[12px]">
                      {isRejected ? "Not used" : "Not this"}
                    </Button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {chips.length > 0 ? (
        <div className="flex flex-col gap-1.5" data-testid="their-vocabulary">
          <span className="text-[11px] text-fg-subtle">Their vocabulary</span>
          <ul className="flex flex-wrap gap-1.5" aria-label="Their vocabulary">
            {chips.map((entry) => {
              const active = selectedTerm === entry.term;
              return (
                <li key={entry.term}>
                  <button
                    type="button"
                    onClick={() => select(entry)}
                    aria-pressed={active}
                    aria-label={`${entry.term}, said ${entry.count} times, ${entry.kind.replace("_", " ")}, see moments`}
                    data-kind={entry.kind}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] leading-tight transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none",
                      active ? "border-accent text-accent" : "border-border text-fg-muted",
                    )}
                  >
                    <span>{entry.term}</span>
                    <span className="tabular-nums text-fg-subtle">&times;{entry.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
