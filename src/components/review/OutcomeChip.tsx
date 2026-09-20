import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { ChatsCircle, PhoneX, Question, UserMinus, Voicemail } from "@phosphor-icons/react";
import type { CallInterpretedOutcome } from "@/domain/types";
import { OUTCOME_WORD } from "@/lib/review";
import { cn } from "@/lib/cn";

const ICON: Record<CallInterpretedOutcome, ComponentType<IconProps>> = {
  meaningful_interaction: ChatsCircle,
  voicemail: Voicemail,
  no_answer: PhoneX,
  wrong_contact: UserMinus,
  unknown: Question,
};

/** Outcome as a chip: a word and an icon, never color alone. */
export function OutcomeChip({ outcome, className }: { outcome: CallInterpretedOutcome; className?: string }) {
  const Icon = ICON[outcome];
  return (
    <span className={cn("chip", outcome === "meaningful_interaction" ? "text-fg" : "text-fg-muted", className)}>
      <Icon size={12} weight="bold" aria-hidden />
      {OUTCOME_WORD[outcome]}
    </span>
  );
}
