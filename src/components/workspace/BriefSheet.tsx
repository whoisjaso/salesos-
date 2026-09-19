"use client";

import { useState } from "react";
import { CaretRight, Question, ShuffleAngular } from "@phosphor-icons/react";
import type { CloserBrief, UpcomingAppointment } from "@/lib/workspace-closer";
import { lensByName } from "@/content/lenses";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { BriefRowView, EvidenceTag } from "./EvidenceTag";

export interface BriefSheetProps {
  open: boolean;
  onClose: () => void;
  item: UpcomingAppointment;
  brief: CloserBrief;
}

/** Pre-call brief: why you, then short labeled rows. Every assertion carries its provenance (SOS-10). */
export function BriefSheet({ open, onClose, item, brief }: BriefSheetProps) {
  const [asked, setAsked] = useState(false);
  const lens = brief.lensHypothesis ? lensByName[brief.lensHypothesis] : undefined;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Brief"
      description={item.contact.organizationName ? `${item.contact.displayName}, ${item.contact.organizationName}` : item.contact.displayName}
      footer={
        <Button variant="secondary" className="w-full" disabled={asked} onClick={() => setAsked(true)} leading={<Question size={15} weight="bold" />}>
          {asked ? "Clarification requested" : "Ask for clarification"}
        </Button>
      }
    >
      <div className="divide-y divide-line">
        {item.assignment ? (
          <div className="py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                <ShuffleAngular size={11} weight="bold" aria-hidden />
                Why you
              </span>
              <EvidenceTag label="Verified" />
            </div>
            <p className="text-[13px] leading-snug text-fg-muted">{item.assignment.explanation}</p>
          </div>
        ) : null}

        {brief.rows.map((r) => (
          <BriefRowView key={r.label} label={r.label} text={r.text} evidence={r.evidence} />
        ))}

        <div className="py-2.5">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Verified fit</div>
          {brief.fit.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">Not assessed</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {brief.fit.map((f) => (
                <li key={f.key} className={cn("inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-[12px]", f.value === "yes" ? "border-[color:var(--perf-strong-line)] text-fg" : f.value === "partial" ? "border-[color:var(--perf-attention-line)] text-fg" : "border-dashed border-line-strong text-fg-muted")}>
                  {f.key}
                  <span className="font-semibold">{f.value}</span>
                  <EvidenceTag label={f.evidence} className="h-4 px-1 text-[9.5px]" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="py-2.5">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Unknowns</div>
          {brief.unknowns.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">None flagged</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {brief.unknowns.map((u) => (
                <li key={u} className="inline-flex h-6 items-center rounded-sm border border-dashed border-line-strong px-2 text-[12px] text-fg-muted">
                  {u}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="py-2.5">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Communication preferences</div>
          {brief.preferences.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">None recorded</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {brief.preferences.map((p, i) => (
                <li key={i} className="flex items-start justify-between gap-3">
                  <span className="text-[13.5px] leading-snug text-fg">{p.text}</span>
                  <EvidenceTag label={p.evidence} className="mt-0.5" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {lens ? (
          <details className="group py-2.5">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-fg-subtle">
              <CaretRight size={11} weight="bold" aria-hidden className="transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              Coaching lens (hypothesis)
            </summary>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium text-fg">{lens.label}</div>
                <div className="text-[12px] text-fg-muted">{lens.usefulAdaptation}</div>
              </div>
              <EvidenceTag label="AI-proposed" />
            </div>
          </details>
        ) : null}
      </div>
    </Sheet>
  );
}
