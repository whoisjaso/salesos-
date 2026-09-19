"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { PRESETS, type DryRunReport, type MappingPlan } from "@/domain/migration";
import { formatAsOf, formatCount } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { DetailsRow } from "@/components/ui/DetailsRow";
import { Sheet } from "@/components/ui/Sheet";
import { Surface } from "@/components/ui/Surface";
import { errorRows, IGNORE, targetLabel } from "./import-model";

export interface DoneStepProps {
  fileName: string;
  plan: MappingPlan;
  report: DryRunReport;
  /** ISO time the import ran. */
  at: string;
  onAgain: () => void;
}

/** One check, one number, one button. The counts and the mapping sit behind Receipt. */
export function DoneStep({ fileName, plan, report, at, onAgain }: DoneStepProps) {
  const reduce = useReducedMotion();
  const [receipt, setReceipt] = useState(false);
  const skipped = errorRows(report.issues);
  const rowsIn = Math.max(0, report.rows - skipped);
  const mapped = plan.columns.filter((c) => c.target !== IGNORE);

  return (
    <div className="flex flex-col items-center gap-6 pt-4 text-center">
      <motion.span initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }} className="grid h-16 w-16 place-items-center rounded-full bg-[color:var(--perf-strong-tint)]">
        <CheckCircle size={40} weight="fill" aria-hidden className="text-perf-strong" />
      </motion.span>
      <div>
        <div className="tabular text-[44px] font-semibold leading-none tracking-tight text-fg">{formatCount(rowsIn)}</div>
        <div className="mt-2 text-[12px] font-medium text-fg-subtle">Rows in</div>
      </div>

      <div className="flex w-full flex-col gap-3 pt-2">
        <Button href="/" className="w-full" trailing={<ArrowRight size={16} weight="bold" />}>
          See Business
        </Button>
        <Surface padding="none" className="text-left">
          <DetailsRow label="Receipt" value={formatAsOf(at)} onClick={() => setReceipt(true)} />
        </Surface>
        <Button variant="ghost" size="sm" onClick={onAgain} className="self-center">
          Import another
        </Button>
      </div>

      <Sheet open={receipt} onClose={() => setReceipt(false)} title="Receipt" description={formatAsOf(at)}>
        <dl className="flex flex-col gap-4 text-left">
          <Row k="File" v={fileName} />
          <Row k="Preset" v={PRESETS[plan.preset].label} />
          <Row k="Rows" v={`${formatCount(rowsIn)} in${skipped ? `, ${formatCount(skipped)} skipped` : ""}`} />
          <Row k="People" v={formatCount(report.contacts.create + report.contacts.merge)} />
          <Row k="Deals" v={formatCount(report.opportunities)} />
          <Row k="Appointments" v={formatCount(report.appointments)} />
          <Row k="Payments" v={formatCount(report.payments.count)} />
          <div>
            <dt className="text-[12px] font-medium text-fg-subtle">Mapping</dt>
            <dd className="mt-2 rounded-sm border border-line bg-sunken">
              <ul className="divide-y divide-line">
                {mapped.map((c) => (
                  <li key={c.header} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-fg">{c.header}</span>
                    <ArrowRight size={12} weight="bold" aria-hidden className="shrink-0 text-fg-faint" />
                    <span className="min-w-0 flex-1 truncate text-right text-fg-muted">{targetLabel(c.target)}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </Sheet>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-fg-subtle">{k}</dt>
      <dd className="mt-1 break-words text-[14px] text-fg">{v}</dd>
    </div>
  );
}
