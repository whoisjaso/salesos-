"use client";

import { useMemo, useState } from "react";
import type { DryRunReport, RowIssue } from "@/domain/migration";
import { cn } from "@/lib/cn";
import { formatCount, formatMoneyMinor } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import { errorRows, lineOf, SEVERITY_LABEL, SEVERITY_ORDER, type Severity } from "./import-model";

export interface CheckStepProps {
  report: DryRunReport;
  onImport: () => void;
}

const VISIBLE = 20;

export function CheckStep({ report, onImport }: CheckStepProps) {
  const [expanded, setExpanded] = useState(false);
  const grouped = useMemo(() => SEVERITY_ORDER.map((s) => ({ severity: s, items: report.issues.filter((i) => i.severity === s) })).filter((g) => g.items.length > 0), [report.issues]);
  const errors = useMemo(() => errorRows(report.issues), [report.issues]);
  const total = report.rows;
  const ready = Math.round(Math.max(0, Math.min(100, report.readyPercent)));
  const keep = Math.max(0, total - errors);

  const hiddenCount = Math.max(0, report.issues.length - VISIBLE);
  const visible = useMemo(() => capGroups(grouped, expanded ? Infinity : VISIBLE), [grouped, expanded]);

  return (
    <div className="flex flex-col gap-6">
      <Surface padding="lg" className="text-center">
        <div className="tabular text-[56px] font-semibold leading-none tracking-tight text-fg">{ready}%</div>
        <div className="mt-2 text-[14px] text-fg-muted">ready</div>
      </Surface>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="People" value={formatCount(report.contacts.create + report.contacts.merge)} sub={`${formatCount(report.contacts.create)} new, ${formatCount(report.contacts.merge)} merge`} />
        <Tile label="Deals" value={formatCount(report.opportunities)} />
        <Tile label="Appointments" value={formatCount(report.appointments)} />
        <Tile label="Payments" value={formatCount(report.payments.count)} sub={report.payments.count ? formatMoneyMinor(report.payments.totalMinor, report.payments.currency) : undefined} />
      </div>

      {report.consentPreserved > 0 ? (
        <p className="tabular px-1 text-[13px] text-fg-muted">
          {formatCount(report.consentPreserved)} {report.consentPreserved === 1 ? "opt-out" : "opt-outs"} kept
        </p>
      ) : null}

      {grouped.length ? (
        <section aria-label="Issues" className="flex flex-col gap-4">
          {visible.map((g) => (
            <div key={g.severity} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between px-1">
                <h2 className={cn("text-[13px] font-medium", TONE[g.severity])}>{SEVERITY_LABEL[g.severity]}</h2>
                <span className="tabular text-[11.5px] text-fg-subtle">{formatCount(grouped.find((x) => x.severity === g.severity)?.items.length ?? g.items.length)}</span>
              </div>
              <Surface padding="none">
                <ul className="divide-y divide-line">
                  {g.items.map((i, idx) => (
                    <IssueLine key={`${i.row}-${i.header}-${idx}`} i={i} />
                  ))}
                </ul>
              </Surface>
            </div>
          ))}
          {hiddenCount > 0 && !expanded ? (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(true)} className="self-start">
              {formatCount(hiddenCount)} more
            </Button>
          ) : null}
        </section>
      ) : null}

      <Button onClick={onImport} className="w-full">
        {errors > 0 ? `Import ${formatCount(keep)}, skip ${formatCount(errors)}` : `Import ${formatCount(total)} rows`}
      </Button>
    </div>
  );
}

interface IssueGroup {
  severity: Severity;
  items: RowIssue[];
}

/** First `cap` issues across the groups, errors first. */
function capGroups(groups: IssueGroup[], cap: number): IssueGroup[] {
  const out: IssueGroup[] = [];
  let room = cap;
  for (const g of groups) {
    const items = g.items.slice(0, Math.max(0, room));
    room -= items.length;
    if (items.length) out.push({ severity: g.severity, items });
  }
  return out;
}

const TONE: Record<Severity, string> ={ error: "text-perf-issue", warning: "text-perf-attention" };

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Surface padding="sm" className="flex min-h-[84px] flex-col justify-between">
      <span className="text-[12px] font-medium text-fg-muted">{label}</span>
      <span>
        <span className="tabular block text-[24px] font-semibold leading-none tracking-tight text-fg">{value}</span>
        {sub ? <span className="tabular mt-1 block truncate text-[11.5px] text-fg-subtle">{sub}</span> : null}
      </span>
    </Surface>
  );
}

function IssueLine({ i }: { i: RowIssue }) {
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className="tabular mt-0.5 w-11 shrink-0 text-[12px] text-fg-subtle">Row {lineOf(i.row)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium leading-tight text-fg">{i.header || "Row"}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-muted">{i.problem}</span>
        {i.value ? <span className="mt-0.5 block truncate font-mono text-[11.5px] text-fg-subtle">{i.value}</span> : null}
      </span>
    </li>
  );
}
