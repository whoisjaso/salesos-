"use client";

import { useMemo, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { PRESETS, type ColumnMapping, type ColumnProfile, type MappingPlan, type TargetField } from "@/domain/migration";
import { formatCount, formatFraction } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { HeroCard } from "@/components/owner/HeroCard";
import { bestAlternative, confidencePercent, IGNORE, reviewHeaders, targetGroups, targetLabel } from "./import-model";

export interface MatchStepProps {
  fileName: string;
  rowCount: number;
  plan: MappingPlan;
  profiles: ColumnProfile[];
  onChangeTarget: (header: string, target: TargetField) => void;
  onNext: () => void;
}

/** One number (columns matched), the columns that need a look, one button. Every column sits behind a row. */
export function MatchStep({ fileName, rowCount, plan, profiles, onChangeTarget, onNext }: MatchStepProps) {
  const [allOpen, setAllOpen] = useState(false);
  const groups = useMemo(() => targetGroups(), []);
  const review = useMemo(() => reviewHeaders(plan), [plan]);
  const sampleOf = useMemo(() => new Map(profiles.map((p) => [p.header, p.sampleValues.filter(Boolean).slice(0, 2)])), [profiles]);

  const needs = plan.columns.filter((c) => review.has(c.header));

  return (
    <div className="flex flex-col gap-4">
      <HeroCard label="Matched" value={formatFraction(plan.mappedCount, plan.totalColumns)} caption={`${PRESETS[plan.preset].label}, ${formatCount(rowCount)} rows`} />

      {needs.length ? (
        <section aria-label="Review" className="flex flex-col gap-2">
          <h2 className="px-1 text-[12px] font-medium text-fg-subtle">Review</h2>
          <Surface padding="none">
            <ul className="divide-y divide-line">
              {needs.map((c) => (
                <li key={c.header} className="flex flex-col gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium leading-tight text-fg">{c.header}</div>
                    <div className="mt-0.5 truncate text-[12.5px] text-fg-subtle">{(sampleOf.get(c.header) ?? []).join(", ") || "Empty"}</div>
                  </div>
                  <TargetSelect header={c.header} value={bestAlternative(c)} groups={groups} onChange={(t) => onChangeTarget(c.header, t)} />
                </li>
              ))}
            </ul>
          </Surface>
        </section>
      ) : null}

      <Surface padding="none">
        <DetailsRow label="All columns" value={formatCount(plan.totalColumns)} data-testid="all-columns-open" onClick={() => setAllOpen(true)} />
      </Surface>

      <Button onClick={onNext} className="w-full">
        Check
      </Button>

      <Sheet open={allOpen} onClose={() => setAllOpen(false)} title="All columns" description={fileName}>
        <ul className="divide-y divide-line">
          {plan.columns.map((c) => (
            <CompactRow key={c.header} c={c} />
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

function CompactRow({ c }: { c: ColumnMapping }) {
  return (
    <li className="flex min-h-11 items-center gap-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{c.header}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{targetLabel(c.target)}</span>
      <span className="tabular shrink-0 text-[12px] text-fg-subtle">{confidencePercent(c)}</span>
    </li>
  );
}

function TargetSelect({ header, value, groups, onChange }: { header: string; value: TargetField; groups: ReturnType<typeof targetGroups>; onChange: (t: TargetField) => void }) {
  return (
    <div className="relative">
      <select
        aria-label={`Target for ${header}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-sm border border-line-strong bg-sunken pl-3 pr-9 text-[14px] text-fg focus:border-line-focus focus:outline-none"
      >
        <option value={IGNORE}>Ignore</option>
        {groups.map((g) => (
          <optgroup key={g.entity} label={g.label}>
            {g.fields.map((f) => (
              <option key={f.field} value={f.field}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <CaretDown size={14} weight="bold" aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}
