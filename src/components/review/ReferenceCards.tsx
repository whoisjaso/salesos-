"use client";

import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { ChatCircleText, CheckCircle, Eye, HandPointing, Lightbulb, Question, PushPin, Prohibit, Users, UsersThree } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
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

export interface ReferenceCardsProps {
  references: ReferenceView[];
  pinned: ReadonlySet<string>;
  rejected: ReadonlySet<string>;
  onJump: (spanIndex: number) => void;
  onPin: (referenceId: string) => void;
  onReject: (referenceId: string) => void;
}

/**
 * Their words. One card per reference: the exact expression large, one meaning line, a tiny
 * origin word and meaning-status word, Use later (pin) and Not this (stop reuse). Tapping
 * the expression goes to the cited span. Pinning protects position; it never certifies accuracy.
 */
export function ReferenceCards({ references, pinned, rejected, onJump, onPin, onReject }: ReferenceCardsProps) {
  if (references.length === 0) return <span className="text-[13px] text-fg-subtle">Nothing distinctive yet</span>;
  return (
    <ul className="flex flex-col gap-3" aria-label="Their words">
      {references.map((r) => {
        const isPinned = pinned.has(r.referenceId);
        const isRejected = rejected.has(r.referenceId);
        const OriginIcon = ORIGIN_ICON[r.originWord] ?? Question;
        const MeaningIcon = MEANING_ICON[r.meaningWord] ?? Question;
        return (
          <li key={r.referenceId} className={cn("flex flex-col gap-1.5", isRejected && "opacity-60")} data-testid="reference-card" data-rejected={isRejected ? "true" : undefined} data-pinned={isPinned ? "true" : undefined}>
            <button type="button" onClick={() => onJump(r.spanIndex)} className="rounded-sm text-left text-[17px] font-semibold leading-snug text-fg hover:text-accent" aria-label={`${r.expression}, see moment`} data-testid="reference-expression">
              &ldquo;{r.expression}&rdquo;
            </button>
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
  );
}
