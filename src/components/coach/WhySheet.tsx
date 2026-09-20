"use client";

import type { ComponentType } from "react";
import { Barbell, CalendarCheck, Calculator, Eye, GitBranch, MagnifyingGlass } from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import type { CoachingRecommendation } from "@/domain/types";
import { isPerceptionGapRecommendation } from "@/domain/coaching";
import { Sheet } from "@/components/ui/Sheet";
import { StateChip } from "@/components/ui/StateChip";
import { formatAsOf, formatCount, formatFraction, formatMoney, formatPercent } from "@/lib/format";

export interface WhySheetProps {
  open: boolean;
  onClose: () => void;
  rec: CoachingRecommendation;
}

interface Step {
  icon: ComponentType<IconProps>;
  label: string;
  body: React.ReactNode;
}

/** The SOS-16 six-part sequence as a vertical stepper. Opens from the "Why" button. */
export function WhySheet({ open, onClose, rec }: WhySheetProps) {
  const s = rec.scenario;
  const perception = isPerceptionGapRecommendation(rec) ? rec.perception : undefined;
  const steps: Step[] = [
    {
      icon: Eye,
      label: "Observation",
      body: (
        <div>
          <p className="text-[13.5px] text-fg">{rec.observed}</p>
          {perception ? (
            <dl className="tabular mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[12.5px]">
              <dt className="text-fg-subtle">Verified fit</dt>
              <dd className="text-fg">
                {formatPercent(perception.verified.value, { digits: 0 })}, {formatFraction(perception.verified.numerator, perception.verified.denominator)} attended
              </dd>
              <dt className="text-fg-subtle">Perceived fit</dt>
              <dd className="text-fg">
                {formatPercent(perception.perceived.value, { digits: 0 })}, {formatFraction(perception.perceived.numerator, perception.perceived.denominator)} attended
              </dd>
            </dl>
          ) : null}
          {rec.suppressed ? <p className="mt-1 text-[12.5px] leading-snug text-fg-muted">{rec.suppressed.reason}</p> : null}
        </div>
      ),
    },
    {
      icon: MagnifyingGlass,
      label: "Evidence check",
      body: (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <StateChip state={rec.dataState} />
            {rec.metricIds.map((m) => (
              <span key={m} className="tabular inline-flex h-6 items-center rounded-sm border border-line-strong px-2 text-[12px] font-medium text-fg-muted">
                {m}
              </span>
            ))}
          </div>
          <p className="text-[12.5px] text-fg-muted">{rec.comparator}</p>
          <p className="tabular text-[12px] text-fg-subtle">{rec.cohortId}</p>
        </div>
      ),
    },
    {
      icon: GitBranch,
      label: "Possible causes",
      body: (
        <ul className="flex flex-col gap-1">
          {rec.alternativeExplanations.map((a) => (
            <li key={a} className="text-[13px] leading-snug text-fg-muted">
              {a}
            </li>
          ))}
        </ul>
      ),
    },
    {
      icon: Barbell,
      label: "Practice",
      body: (
        <div>
          <p className="text-[13.5px] text-fg">{rec.action.charAt(0).toUpperCase() + rec.action.slice(1)}</p>
          <p className="mt-1 text-[12.5px] text-fg-subtle">{rec.effort}</p>
        </div>
      ),
    },
    ...(s
      ? [
          {
            icon: Calculator,
            label: "Scenario",
            body: (
              <div className="flex flex-col gap-2">
                <dl className="tabular grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                  <dt className="text-fg-subtle">Units</dt>
                  <dd className="font-medium text-fg">+{formatCount(Math.round(s.additionalUnits * 10) / 10)}</dd>
                  <dt className="text-fg-subtle">Cash</dt>
                  <dd className="font-medium text-fg">{formatMoney(s.modeledCash)}</dd>
                  {s.modeledCommission ? (
                    <>
                      <dt className="text-fg-subtle">Commission</dt>
                      <dd className="font-medium text-fg">{formatMoney(s.modeledCommission)}</dd>
                    </>
                  ) : null}
                </dl>
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex h-6 items-center rounded-sm border border-dashed border-line-strong px-2 text-[11.5px] font-medium text-fg-muted">{s.disclaimer}</span>
                  {s.commissionBasisHypothetical ? <span className="inline-flex h-6 items-center rounded-sm border border-dashed border-line-strong px-2 text-[11.5px] font-medium text-fg-muted">Hypothetical policy</span> : null}
                  {s.capacityCapApplied ? <span className="inline-flex h-6 items-center rounded-sm border border-line-strong px-2 text-[11.5px] font-medium text-fg-muted">Capacity cap</span> : null}
                </div>
                <details className="text-[12.5px] text-fg-muted">
                  <summary className="cursor-pointer select-none text-fg-subtle hover:text-fg">Assumptions</summary>
                  <ul className="mt-1.5 flex flex-col gap-1 pl-3">
                    {s.assumptions.map((a) => (
                      <li key={a} className="list-disc leading-snug">
                        {a}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ),
          } satisfies Step,
        ]
      : []),
    {
      icon: CalendarCheck,
      label: "Review",
      body: (
        <div>
          <p className="tabular text-[13.5px] text-fg">{formatAsOf(rec.reviewAt)}</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {rec.guardrails.map((g) => (
              <li key={g} className="text-[12.5px] leading-snug text-fg-muted">
                {g}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="Why" description={rec.title}>
      <ol className="relative flex flex-col">
        {steps.map((st, i) => {
          const Icon = st.icon;
          const last = i === steps.length - 1;
          return (
            <li key={st.label} className="relative flex gap-3 pb-5">
              {!last ? <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px bg-line" /> : null}
              <span className="relative z-10 inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-raised text-fg-muted">
                <Icon size={15} weight="bold" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <div className="mb-1 text-[11.5px] font-medium text-fg-subtle">{st.label}</div>
                {st.body}
              </div>
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
