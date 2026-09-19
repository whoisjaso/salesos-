"use client";

import { useMemo, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { PRESETS, type ColumnMapping, type ColumnProfile, type MappingPlan, type TargetField } from "@/domain/migration";
import { cn } from "@/lib/cn";
import { formatCount, formatFraction } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Surface } from "@/components/ui/Surface";
import { LogoTile } from "@/components/connect/LogoTile";
import { bestAlternative, confidencePercent, IGNORE, presetProvider, reviewHeaders, targetGroups, targetLabel } from "./import-model";

export interface MatchStepProps {
  fileName: string;
  rowCount: number;
  plan: MappingPlan;
  profiles: ColumnProfile[];
  onChangeTarget: (header: string, target: TargetField) => void;
  onNext: () => void;
}

export function MatchStep({ fileName, rowCount, plan, profiles, onChangeTarget, onNext }: MatchStepProps) {
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => targetGroups(), []);
  const review = useMemo(() => reviewHeaders(plan), [plan]);
  const sampleOf = useMemo(() => new Map(profiles.map((p) => [p.header, p.sampleValues.filter(Boolean).slice(0, 2)])), [profiles]);

  const needs = plan.columns.filter((c) => review.has(c.header));
  const sure = plan.columns.filter((c) => !review.has(c.header));
  const preset = presetProvider(plan.preset);
  const total = Math.max(1, plan.totalColumns);

  return (
    <div className="flex flex-col gap-6">
      <Surface padding="md" className="flex items-center gap-4">
        <ProgressRing value={plan.mappedCount / total} size={72} strokeWidth={6} label="Columns matched" className="shrink-0 [&>span]:font-semibold" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-fg-subtle">Columns matched</div>
          <div className="tabular mt-1 text-[32px] font-semibold leading-none tracking-tight text-fg">{formatFraction(plan.mappedCount, plan.totalColumns)}</div>
          <div className="mt-2 flex items-center gap-2">
            <LogoTile p={preset} size={20} />
            <span className="truncate text-[12px] font-medium text-fg">{PRESETS[plan.preset].label}</span>
            <span className="tabular shrink-0 text-[12px] text-fg-subtle">{formatCount(rowCount)} rows</span>
            <span className="truncate text-[12px] text-fg-subtle">{fileName}</span>
          </div>
        </div>
      </Surface>

      {needs.length ? (
        <section aria-label="Review" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-[12px] font-medium text-fg-subtle">Review</h2>
            <span className="tabular text-[12px] text-fg-subtle">{formatCount(needs.length)}</span>
          </div>
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
      ) : (
        <p className="px-1 text-[12px] font-medium text-fg-subtle">Nothing to review</p>
      )}

      <section aria-label="All columns" className="flex flex-col gap-2">
        <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="flex h-9 items-center gap-1.5 self-start rounded-sm px-1 text-[13px] font-medium text-fg-muted hover:text-fg">
          {showAll ? "Hide" : "Show all columns"}
          <CaretDown size={12} weight="bold" aria-hidden className={cn("transition-transform motion-reduce:transition-none", showAll && "rotate-180")} />
        </button>
        {showAll && sure.length ? (
          <Surface padding="none">
            <ul className="divide-y divide-line">
              {sure.map((c) => (
                <CompactRow key={c.header} c={c} />
              ))}
            </ul>
          </Surface>
        ) : null}
      </section>

      <Button onClick={onNext} className="w-full">
        Check
      </Button>
    </div>
  );
}

function CompactRow({ c }: { c: ColumnMapping }) {
  return (
    <li className="flex min-h-11 items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{c.header}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{targetLabel(c.target)}</span>
      <span className="tabular inline-flex h-6 shrink-0 items-center rounded-sm border border-line-strong px-1.5 text-[11.5px] font-medium text-fg-muted">{confidencePercent(c)}</span>
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
