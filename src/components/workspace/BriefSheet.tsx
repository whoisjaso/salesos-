"use client";

import { useState } from "react";
import { ArrowRight, CaretRight, Question, ShuffleAngular } from "@phosphor-icons/react";
import type { BuyerModeBriefRow, CloserBrief, ReadBriefRow, UpcomingAppointment } from "@/lib/workspace-closer";
import { NO_SIGNAL_WORD } from "@/lib/workspace-closer";
import { READ_CAPTION } from "@/lib/review";
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

/**
 * Tiny confidence mark: filled at or above CONFIDENT, hollow below. Always paired with a value
 * word, and named for screen readers, so the state never rides on the shape alone.
 */
export function ConfidenceDot({ confident, className }: { confident: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={confident ? "Confident" : "Low confidence"}
      title={confident ? "Confident" : "Low confidence"}
      data-testid="confidence-dot"
      data-confident={confident}
      className={cn("inline-block size-2 shrink-0 rounded-full", confident ? "bg-fg" : "border border-fg-subtle", className)}
    />
  );
}

/** Slim bar for a read percentage. The number is always beside it. */
export function ReadBar({ percent, className }: { percent: number; className?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <span role="img" aria-label={`${p}%`} className={cn("block h-1 w-full overflow-hidden rounded-full bg-line", className)}>
      <span className="block h-1 rounded-full bg-accent" style={{ width: `${p}%` }} />
    </span>
  );
}

/** A quoted customer span: the words, then the provenance tag (the brief's evidence pattern). */
export function QuoteList({ quotes }: { quotes: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 pb-2 pl-1" data-testid="cited-words">
      {quotes.map((q) => (
        <li key={q} className="flex items-start justify-between gap-3">
          <span className="text-[13px] leading-snug text-fg-muted">&ldquo;{q}&rdquo;</span>
          <EvidenceTag label="Customer-stated" className="mt-0.5" />
        </li>
      ))}
    </ul>
  );
}

function DimensionRow({ row, open, onToggle }: { row: BuyerModeBriefRow; open: boolean; onToggle: () => void }) {
  return (
    <li className="flex flex-col" data-testid="buyer-mode-row">
      <button type="button" onClick={onToggle} aria-expanded={open} className="-mx-1 flex h-10 items-center gap-2 rounded-md px-1 text-left hover:bg-hover">
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
          {row.label}: <span className="font-semibold">{row.value}</span>
        </span>
        <ConfidenceDot confident={row.confident} />
        <CaretRight size={12} weight="bold" aria-hidden className={cn("text-fg-subtle transition-transform motion-reduce:transition-none", open && "rotate-90")} />
      </button>
      {open ? <QuoteList quotes={row.quotes} /> : null}
    </li>
  );
}

function ReadRow({ row, open, onToggle }: { row: ReadBriefRow; open: boolean; onToggle: () => void }) {
  return (
    <li className="flex flex-col" data-testid="read-row">
      <button type="button" onClick={onToggle} aria-expanded={open} className="-mx-1 flex h-10 items-center gap-3 rounded-md px-1 text-left hover:bg-hover">
        <span className="tabular w-[132px] shrink-0 truncate text-[13.5px] text-fg">
          {row.label} <span className="text-fg-muted">{row.percent}%</span>
        </span>
        <ReadBar percent={row.percent} />
        <CaretRight size={12} weight="bold" aria-hidden className={cn("text-fg-subtle transition-transform motion-reduce:transition-none", open && "rotate-90")} />
      </button>
      {open ? <QuoteList quotes={row.quotes} /> : null}
    </li>
  );
}

/**
 * Pre-call brief: why you, the short labeled rows, verified fit, unknowns, then Buyer mode (the
 * top three known dimensions, the approach, the read, and the stated preferences as evidence).
 * The coaching lens sits under More. Every assertion carries its provenance (SOS-10).
 */
export function BriefSheet({ open, onClose, item, brief }: BriefSheetProps) {
  const [asked, setAsked] = useState(false);
  const [openRow, setOpenRow] = useState<string | undefined>(undefined);
  const lens = brief.lensHypothesis ? lensByName[brief.lensHypothesis] : undefined;
  const bm = brief.buyerMode;
  const toggle = (id: string) => setOpenRow((cur) => (cur === id ? undefined : id));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Brief"
      description={item.contact.organizationName ? `${item.contact.displayName}, ${item.contact.organizationName}` : item.contact.displayName}
      footer={
        <Button variant="secondary" size="lg" className="w-full" disabled={asked} onClick={() => setAsked(true)} leading={<Question size={16} weight="bold" />}>
          {asked ? "Clarification requested" : "Ask for clarification"}
        </Button>
      }
    >
      <div className="divide-y divide-line">
        {item.assignment ? (
          <div className="py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="section-label inline-flex items-center gap-1">
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
          <div className="section-label mb-1.5">Verified fit</div>
          {brief.fit.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">Not assessed</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {brief.fit.map((f) => (
                <li key={f.key} className={cn("chip", f.value === "yes" ? "border-[color:var(--perf-strong-line)] text-fg" : f.value === "partial" ? "border-[color:var(--perf-attention-line)] text-fg" : "border-dashed text-fg-muted")}>
                  {f.key}
                  <span className="font-semibold">{f.value}</span>
                  <EvidenceTag label={f.evidence} className="h-4 px-1 text-[9.5px]" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="py-2.5">
          <div className="section-label mb-1.5">Unknowns</div>
          {brief.unknowns.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">None flagged</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {brief.unknowns.map((u) => (
                <li key={u} className="chip border-dashed text-fg-muted">
                  {u}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ----- Buyer mode: how they decide, from their words. Preferences fold in as evidence. ----- */}
        <section className="py-2.5" aria-label="Buyer mode" data-testid="buyer-mode">
          <div className="mb-1 flex items-center justify-between">
            <span className="section-label">Buyer mode</span>
            {bm.empty ? null : <EvidenceTag label="Customer-stated" />}
          </div>
          {bm.empty ? (
            <p className="text-[13px] text-fg-subtle" data-testid="buyer-mode-empty">
              {NO_SIGNAL_WORD}
            </p>
          ) : (
            <>
              {bm.rows.length > 0 ? (
                <ul className="flex flex-col">
                  {bm.rows.map((r) => (
                    <DimensionRow key={r.dimension} row={r} open={openRow === r.dimension} onToggle={() => toggle(r.dimension)} />
                  ))}
                </ul>
              ) : null}
              {bm.approach.length > 0 ? (
                <div className="mt-2">
                  <div className="section-label mb-1">Approach</div>
                  <ul className="flex flex-col gap-1" data-testid="approach">
                    {bm.approach.map((line) => (
                      <li key={line} className="flex items-start gap-2 text-[13.5px] leading-snug text-fg">
                        <ArrowRight size={13} weight="bold" aria-hidden className="mt-[3px] shrink-0 text-fg-subtle" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {bm.read.length > 0 ? (
                <div className="mt-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="section-label">Read</span>
                    <span className="text-[11px] text-fg-subtle">{READ_CAPTION}</span>
                  </div>
                  <ul className="flex flex-col">
                    {bm.read.map((r) => (
                      <ReadRow key={r.name} row={r} open={openRow === `read:${r.name}`} onToggle={() => toggle(`read:${r.name}`)} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
          {bm.evidence.length > 0 ? (
            <div className="mt-2">
              <div className="section-label mb-1">Evidence</div>
              <ul className="flex flex-col gap-1.5">
                {bm.evidence.map((p, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <span className="text-[13px] leading-snug text-fg-muted">{p.text}</span>
                    <EvidenceTag label={p.evidence} className="mt-0.5" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {lens ? (
          <details className="group">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-fg-muted">
              <CaretRight size={12} weight="bold" aria-hidden className="transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              More
            </summary>
            <div className="border-t border-line py-2.5">
              <div className="section-label mb-1.5">Coaching lens (hypothesis)</div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-medium text-fg">{lens.label}</div>
                  <div className="text-[12px] text-fg-muted">{lens.usefulAdaptation}</div>
                </div>
                <EvidenceTag label="AI-proposed" />
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </Sheet>
  );
}
