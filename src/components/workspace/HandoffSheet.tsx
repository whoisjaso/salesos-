"use client";

import { useState } from "react";
import { PaperPlaneTilt, Question } from "@phosphor-icons/react";
import type { HandoffBrief, BriefLine } from "@/lib/workspace-setter";
import { lensByName } from "@/content/lenses";
import { Button } from "@/components/ui/Button";
import { DetailsRow } from "@/components/ui/DetailsRow";
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
      <h3 className="section-label mb-1.5">{title}</h3>
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

/**
 * Handoff brief preview. Opens on the problem in the customer's words, one number (what is
 * still missing) and the two actions; every section with its provenance sits behind Details.
 * The closer accepts or asks for clarification; the lead never returns to an ownerless queue.
 */
export function HandoffSheet({ open, onClose, brief, contactName, closerName, onSend }: HandoffSheetProps) {
  const [sent, setSent] = useState<"send" | "clarify" | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const description = closerName ? `${contactName} to ${closerName}` : contactName;
  const problem = brief.problem[0]?.text;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Handoff"
        description={description}
        footer={
          sent ? (
            <div className="flex h-11 items-center text-[13px] text-fg-muted">{sent === "send" ? "Sent to closer" : "Clarification requested"}</div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  setSent("clarify");
                  onSend("clarify");
                }}
                leading={<Question size={16} weight="bold" />}
                className="flex-1"
              >
                Clarify
              </Button>
              <Button
                size="lg"
                onClick={() => {
                  setSent("send");
                  onSend("send");
                }}
                leading={<PaperPlaneTilt size={16} weight="bold" />}
                className="flex-1"
              >
                Send to closer
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-col">
          <span className="text-[11px] text-fg-subtle">Their words</span>
          {problem ? <p className="text-[20px] font-semibold leading-snug tracking-tight text-fg">&ldquo;{problem}&rdquo;</p> : <p className="text-[20px] font-semibold text-fg-subtle">No problem recorded</p>}
        </div>
        <div className="-mx-4 mt-4 border-t border-line sm:-mx-5">
          <DetailsRow label="Details" value={brief.missing.length ? `${brief.missing.length} missing` : undefined} onClick={() => setDetailsOpen(true)} data-testid="handoff-details-row" />
        </div>
      </Sheet>
      <HandoffDetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} brief={brief} description={description} />
    </>
  );
}

/** The second sheet: every section of the brief, each line with its provenance (SOS-10). */
function HandoffDetailsSheet({ open, onClose, brief, description }: { open: boolean; onClose: () => void; brief: HandoffBrief; description: string }) {
  const lens = brief.lensHypothesis ? lensByName[brief.lensHypothesis] : undefined;
  return (
    <Sheet open={open} onClose={onClose} title="Details" description={description}>
      <div className="divide-y divide-line" data-testid="handoff-details">
        <Section title="Problem, their words" lines={brief.problem} />
        <Section title="Fit evidence" lines={brief.fitEvidence} empty="Not assessed yet" />
        <Section title="Decision participants" lines={brief.participants} empty="Unknown" />
        <Section title="Timeline" lines={brief.timeline} empty="Unknown" />
        <Section title="Explicit questions" lines={brief.questions} />
        <Section title="Commitments made" lines={brief.commitments} empty="None yet" />
        <Section title="Communication preferences" lines={brief.preferences} />
        {lens ? (
          <div className="py-3">
            <h3 className="section-label mb-1.5">Coaching lens (hypothesis)</h3>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium text-fg">{lens.label}</div>
                <div className="text-[12px] text-fg-muted">{lens.usefulAdaptation}</div>
              </div>
              <EvidenceTag label="AI-proposed" />
            </div>
          </div>
        ) : null}
        <section className="py-3">
          <h3 className="section-label mb-1.5">Missing</h3>
          {brief.missing.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">Nothing flagged</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {brief.missing.map((m) => (
                <li key={m} className="chip border-dashed text-fg-muted">
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
