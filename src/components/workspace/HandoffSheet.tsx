"use client";

import { useState } from "react";
import { CaretRight, PaperPlaneTilt, Question } from "@phosphor-icons/react";
import type { HandoffBrief, BriefLine } from "@/lib/workspace-setter";
import { lensByName } from "@/content/lenses";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { EvidenceTag } from "./EvidenceTag";

export interface HandoffSheetProps {
  open: boolean;
  onClose: () => void;
  brief: HandoffBrief;
  contactName: string;
  closerName?: string;
  onSend: (kind: "send" | "clarify") => void;
}

function Section({ title, lines, empty = "None" }: { title: string; lines: BriefLine[]; empty?: string }) {
  return (
    <section className="py-3">
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{title}</h3>
      {lines.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lines.map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3">
              <span className="text-[14px] leading-snug text-fg">{l.text}</span>
              <EvidenceTag label={l.label} className="mt-0.5" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Handoff brief preview. The closer accepts or asks for clarification; the lead never returns to an ownerless queue. */
export function HandoffSheet({ open, onClose, brief, contactName, closerName, onSend }: HandoffSheetProps) {
  const [sent, setSent] = useState<"send" | "clarify" | null>(null);
  const lens = brief.lensHypothesis ? lensByName[brief.lensHypothesis] : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Handoff"
      description={closerName ? `${contactName} to ${closerName}` : contactName}
      footer={
        sent ? (
          <div className="flex h-10 items-center text-[13px] text-fg-muted">{sent === "send" ? "Sent to closer" : "Clarification requested"}</div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setSent("clarify");
                onSend("clarify");
              }}
              leading={<Question size={15} weight="bold" />}
              className="flex-1"
            >
              Clarify
            </Button>
            <Button
              onClick={() => {
                setSent("send");
                onSend("send");
              }}
              leading={<PaperPlaneTilt size={15} weight="bold" />}
              className="flex-1"
            >
              Send to closer
            </Button>
          </div>
        )
      }
    >
      <div className="divide-y divide-line">
        <Section title="Problem, their words" lines={brief.problem} />
        <Section title="Fit evidence" lines={brief.fitEvidence} empty="Not assessed yet" />
        <Section title="Decision participants" lines={brief.participants} empty="Unknown" />
        <Section title="Timeline" lines={brief.timeline} empty="Unknown" />
        <Section title="Explicit questions" lines={brief.questions} />
        <Section title="Commitments made" lines={brief.commitments} empty="None yet" />
        <Section title="Communication preferences" lines={brief.preferences} />
        {lens ? (
          <details className="group py-3">
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
        <section className="py-3">
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Missing</h3>
          {brief.missing.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">Nothing flagged</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {brief.missing.map((m) => (
                <li key={m} className="inline-flex h-6 items-center rounded-sm border border-dashed border-line-strong px-2 text-[12px] text-fg-muted">
                  {m}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  );
}
