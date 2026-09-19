"use client";

import Link from "next/link";
import { CaretRight, Check } from "@phosphor-icons/react";
import type { ChecklistStep, OnboardingChecklist } from "@/domain/onboarding";
import { cn } from "@/lib/cn";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Surface } from "@/components/ui/Surface";

const STEP_HREF: Partial<Record<ChecklistStep["id"], string>> = {
  sourcesConnected: "/connect",
  repsJoined: "/team",
};

export interface ChecklistCardProps {
  checklist: OnboardingChecklist;
  className?: string;
}

/** Six steps from Business profile to First cash, as one list of rows. Gone once all six are done. */
export function ChecklistCard({ checklist, className }: ChecklistCardProps) {
  const done = checklist.steps.filter((s) => s.done).length;
  if (checklist.nextStepId === null) return null;
  return (
    <Surface padding="none" as="section" aria-label="Getting started" className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-3 px-4 py-3">
        <ProgressRing value={checklist.progress} size={40} strokeWidth={3} label={`Getting started, ${done} of ${checklist.steps.length} done`} centerText={`${done}/${checklist.steps.length}`} />
        <div className="text-[15px] font-semibold leading-tight text-fg">Getting started</div>
      </div>
      <ol className="flex flex-col divide-y divide-line border-t border-line" aria-label="Steps">
        {checklist.steps.map((s) => {
          const next = s.id === checklist.nextStepId;
          const href = !s.done ? STEP_HREF[s.id] : undefined;
          const row = (
            <>
              <span className={cn("min-w-0 flex-1 truncate text-[15px]", s.done ? "text-fg-muted" : next ? "font-medium text-fg" : "text-fg-muted")}>{s.label}</span>
              {s.done ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-fg-muted">
                  <Check size={13} weight="bold" aria-hidden />
                  Done
                </span>
              ) : next ? (
                <span className="shrink-0 text-[13px] font-medium text-accent">Next</span>
              ) : null}
              {href ? <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" /> : null}
            </>
          );
          return (
            <li key={s.id} aria-current={next ? "step" : undefined}>
              {href ? (
                <Link href={href} className="flex h-12 items-center gap-3 px-4 transition-colors hover:bg-hover motion-reduce:transition-none">
                  {row}
                </Link>
              ) : (
                <div className="flex h-12 items-center gap-3 px-4">{row}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Surface>
  );
}
