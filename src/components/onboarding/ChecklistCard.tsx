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

/** Six steps from Business profile to First cash. Gone once all six are done. */
export function ChecklistCard({ checklist, className }: ChecklistCardProps) {
  const done = checklist.steps.filter((s) => s.done).length;
  if (checklist.nextStepId === null) return null;
  return (
    <Surface padding="md" as="section" aria-label="Getting started" className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-4">
        <ProgressRing value={checklist.progress} size={56} label={`Getting started, ${done} of ${checklist.steps.length} done`} centerText={`${done}/${checklist.steps.length}`} />
        <div className="min-w-0">
          <div className="text-[17px] font-semibold leading-tight text-fg">Getting started</div>
          <div className="text-[12px] text-fg-subtle">{checklist.steps.length - done} to go</div>
        </div>
      </div>
      <ol className="flex flex-col" aria-label="Steps">
        {checklist.steps.map((s, i) => {
          const next = s.id === checklist.nextStepId;
          const href = !s.done ? STEP_HREF[s.id] : undefined;
          const row = (
            <>
              <span
                aria-hidden
                className={cn(
                  "inline-grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  s.done ? "bg-perf-strong text-[color:var(--bg-base)]" : next ? "bg-accent text-accent-fg" : "border border-line-strong text-fg-subtle",
                )}
              >
                {s.done ? <Check size={12} weight="bold" /> : i + 1}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-[14px]", s.done ? "text-fg-muted line-through decoration-line-strong" : next ? "font-medium text-fg" : "text-fg-muted")}>{s.label}</span>
              {s.done ? <span className="sr-only">Done</span> : null}
              {next ? <span className="tag text-accent">Next</span> : null}
              {href ? <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-fg-subtle" /> : null}
            </>
          );
          return (
            <li key={s.id} aria-current={next ? "step" : undefined} className={cn("-mx-2 rounded-sm", next && "bg-accent-soft")}>
              {href ? (
                <Link href={href} className="flex h-11 items-center gap-3 px-2 transition-colors hover:bg-hover motion-reduce:transition-none">
                  {row}
                </Link>
              ) : (
                <div className="flex h-11 items-center gap-3 px-2">{row}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Surface>
  );
}
