"use client";

import { useMemo, useState } from "react";
import type { DryRunReport, RowIssue } from "@/domain/migration";
import { formatCount, formatMoneyMinor } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { HeroCard } from "@/components/owner/HeroCard";
import { MoneyDisclosure } from "./MoneyDisclosure";
import { errorRows, lineOf, SEVERITY_LABEL, SEVERITY_ORDER, type Severity } from "./import-model";

export interface CheckStepProps {
  report: DryRunReport;
  onImport: () => void;
}

type Open = "rows" | "money" | Severity | null;

/** One number (ready), one list (what is in, what is skipped, what to check), one button. */
export function CheckStep({ report, onImport }: CheckStepProps) {
  const [open, setOpen] = useState<Open>(null);
  const grouped = useMemo(() => SEVERITY_ORDER.map((s) => ({ severity: s, items: report.issues.filter((i) => i.severity === s) })).filter((g) => g.items.length > 0), [report.issues]);
  const errors = useMemo(() => errorRows(report.issues), [report.issues]);
  const total = report.rows;
  const ready = Math.round(Math.max(0, Math.min(100, report.readyPercent)));
  const keep = Math.max(0, total - errors);
  const openGroup = grouped.find((g) => g.severity === open);
  // Money the file carries, whether it is called a payment or a won deal. It is
  // shown only behind the row that explains what it counts toward.
  const recordedMoney = report.payments.count + report.contractedValue.count;
  const recordedTotal = report.payments.totalMinor + report.contractedValue.totalMinor;

  return (
    <div className="flex flex-col gap-4">
      <HeroCard label="Ready" value={`${ready}%`} caption={`${formatCount(keep)} of ${formatCount(total)} rows`} />

      <Surface padding="none">
        <div className="divide-y divide-line">
          <DetailsRow label="Rows" value={formatCount(keep)} data-testid="rows-open" onClick={() => setOpen("rows")} />
          {recordedMoney > 0 ? (
            <DetailsRow
              label="Money"
              hint="Recorded by the old system. Not collected cash."
              value={formatMoneyMinor(recordedTotal, report.money.currency)}
              ariaLabel={`Money: ${formatMoneyMinor(recordedTotal, report.money.currency)} recorded by the old system, which does not count toward net collected cash`}
              data-testid="money-open"
              onClick={() => setOpen("money")}
            />
          ) : null}
          {grouped.map((g) => (
            <DetailsRow key={g.severity} label={SEVERITY_LABEL[g.severity]} value={formatCount(g.items.length)} data-testid={`${g.severity}-open`} onClick={() => setOpen(g.severity)} />
          ))}
        </div>
      </Surface>

      <Button onClick={onImport} className="w-full">
        {errors > 0 ? `Import ${formatCount(keep)}, skip ${formatCount(errors)}` : `Import ${formatCount(total)} rows`}
      </Button>

      <Sheet open={open === "rows"} onClose={() => setOpen(null)} title="Rows" description={`${formatCount(keep)} of ${formatCount(total)}`}>
        <dl className="divide-y divide-line border-t border-line">
          <Line k="People" v={formatCount(report.contacts.create + report.contacts.merge)} sub={`${formatCount(report.contacts.create)} new, ${formatCount(report.contacts.merge)} merge`} />
          <Line k="Deals" v={formatCount(report.opportunities)} />
          <Line k="Appointments" v={formatCount(report.appointments)} />
          {/* Counts only. Every money figure lives behind Money, with the sentence that says what it counts toward. */}
          <Line k="Payments" v={formatCount(report.payments.count)} sub={report.payments.count ? "Recorded, see Money" : undefined} />
          <Line k="Won deals" v={formatCount(report.contractedValue.count)} sub={report.contractedValue.count ? "Contracted value, see Money" : undefined} />
          {report.consentPreserved > 0 ? <Line k={report.consentPreserved === 1 ? "Opt-out kept" : "Opt-outs kept"} v={formatCount(report.consentPreserved)} /> : null}
        </dl>
      </Sheet>

      <Sheet open={open === "money"} onClose={() => setOpen(null)} title="Money" description={`${formatCount(recordedMoney)} ${recordedMoney === 1 ? "record" : "records"} in this file`}>
        <MoneyDisclosure report={report} />
      </Sheet>

      <Sheet open={!!openGroup} onClose={() => setOpen(null)} title={openGroup ? SEVERITY_LABEL[openGroup.severity] : ""} description={openGroup ? `${formatCount(openGroup.items.length)} rows` : undefined}>
        {openGroup ? (
          <ul className="divide-y divide-line">
            {openGroup.items.map((i, idx) => (
              <IssueLine key={`${i.row}-${i.header}-${idx}`} i={i} />
            ))}
          </ul>
        ) : null}
      </Sheet>
    </div>
  );
}

function Line({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
      <dt className="text-fg-subtle">{k}</dt>
      <dd className="tabular text-right text-fg">
        {v}
        {sub ? <span className="block text-[12px] text-fg-subtle">{sub}</span> : null}
      </dd>
    </div>
  );
}

function IssueLine({ i }: { i: RowIssue }) {
  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <span className="tabular w-12 shrink-0 text-[12px] leading-tight text-fg-subtle">Row {lineOf(i.row)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-tight text-fg">{i.header || "Row"}</span>
        <span className="mt-0.5 flex items-baseline gap-2 text-[12px] leading-tight text-fg-muted">
          <span className="shrink-0">{i.problem}</span>
          {i.value ? <span className="min-w-0 truncate font-mono text-[11px] text-fg-subtle">{i.value}</span> : null}
        </span>
      </span>
    </li>
  );
}
