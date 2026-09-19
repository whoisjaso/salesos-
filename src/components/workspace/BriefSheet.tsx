"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CaretRight, ChatCircleText, Question, ShuffleAngular } from "@phosphor-icons/react";
import type { BuyerModeBriefRow, CloserBrief, UpcomingAppointment } from "@/lib/workspace-closer";
import { NO_SIGNAL_WORD, transcriptsFor } from "@/lib/workspace-closer";
import {
  APPROACH_TENTATIVE_SENTENCE,
  NO_APPROACH_WORD,
  READ_MEASURE_SENTENCE,
  SUGGESTED_APPROACH_KICKER,
  VALUE_WORD,
  confidenceWordFor,
} from "@/domain/buyerMode";
import type { Id, LensName } from "@/domain/types";
import { lensByName, lenses } from "@/content/lenses";
import { obaviaDataset } from "@/fixtures/obavia";
import { formatClock } from "@/lib/review";
import { Button } from "@/components/ui/Button";
import { DetailsRow } from "@/components/ui/DetailsRow";
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

/** Slim bar for a read percentage. The number is always beside it, and the sentence is above the list. */
export function ReadBar({ percent, className }: { percent: number; className?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <span role="img" aria-label={`${p}%`} className={cn("block h-1 w-full overflow-hidden rounded-full bg-line", className)}>
      <span className="block h-1 rounded-full bg-accent" style={{ width: `${p}%` }} />
    </span>
  );
}

/** One turn of the transcript around a quoted span. The cited turn carries `cited`. */
export interface PassageTurn {
  speaker: "customer" | "rep" | "unknown";
  text: string;
  startMs: number;
  cited: boolean;
}

/** The passage a quoted span came from, with the turn on either side of it for context. */
export interface Passage {
  callId: Id;
  turns: PassageTurn[];
}

export type PassageFor = (quote: string) => Passage | undefined;

export const OPEN_PASSAGE_LABEL = "read it in the conversation";

/**
 * A quoted customer span: the words, then the provenance tag (the brief's evidence pattern).
 * Tapping the words opens the passage they came from, the cited turn highlighted with the turn
 * on either side, so a conclusion never sits above a transcript the reader has to search.
 */
export function QuoteList({ quotes, passageFor, contactName }: { quotes: string[]; passageFor?: PassageFor; contactName?: string }) {
  const [open, setOpen] = useState<string | undefined>(undefined);
  return (
    <ul className="flex flex-col gap-1.5 pb-2 pl-1" data-testid="cited-words">
      {quotes.map((q) => {
        const passage = passageFor?.(q);
        const isOpen = open === q;
        return (
          <li key={q} className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              {passage ? (
                <button
                  type="button"
                  onClick={() => setOpen((cur) => (cur === q ? undefined : q))}
                  aria-expanded={isOpen}
                  aria-label={`${q}, ${OPEN_PASSAGE_LABEL}`}
                  data-testid="quote-open"
                  className="flex min-w-0 items-start gap-1.5 text-left text-[13px] leading-snug text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                >
                  <ChatCircleText size={13} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-accent" />
                  <span>&ldquo;{q}&rdquo;</span>
                </button>
              ) : (
                <span className="text-[13px] leading-snug text-fg-muted">&ldquo;{q}&rdquo;</span>
              )}
              <EvidenceTag label="Customer-stated" className="mt-0.5" />
            </div>
            {isOpen && passage ? (
              <ol className="flex flex-col gap-1 border-l border-line pl-2.5" data-testid="quote-passage" aria-label="The passage this came from">
                {passage.turns.map((t) => (
                  <li key={t.startMs} data-cited={t.cited ? "true" : undefined} className="flex flex-col">
                    <span className="tabular text-[10.5px] text-fg-subtle">
                      {t.speaker === "customer" ? (contactName ?? "Them") : t.speaker === "rep" ? "Our side" : "Unknown"} · {formatClock(t.startMs)}
                    </span>
                    <span className={cn("text-[12.5px] leading-snug", t.cited ? "rounded-sm bg-accent-soft px-1 py-0.5 font-medium text-fg" : "text-fg-subtle")}>{t.text}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function DimensionRow({ row, open, onToggle, passageFor, contactName }: { row: BuyerModeBriefRow; open: boolean; onToggle: () => void; passageFor?: PassageFor; contactName?: string }) {
  return (
    <li className="flex flex-col" data-testid="buyer-mode-row">
      <button type="button" onClick={onToggle} aria-expanded={open} className="-mx-1 flex h-10 items-center gap-2 rounded-md px-1 text-left hover:bg-hover">
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
          {row.label}: <span className="font-semibold">{row.value}</span>
        </span>
        <ConfidenceDot confident={row.confident} />
        <CaretRight size={12} weight="bold" aria-hidden className={cn("text-fg-subtle transition-transform motion-reduce:transition-none", open && "rotate-90")} />
      </button>
      {open ? <QuoteList quotes={row.quotes} passageFor={passageFor} contactName={contactName} /> : null}
    </li>
  );
}

/** One line of the read, as any surface shows it. */
export interface ReadLine {
  name: LensName;
  label: string;
  /** 0..100, rounded. */
  percent: number;
  /** The customer's own words, exactly as spoken. */
  quotes: string[];
}

export const NO_SIGNAL_SHORT = "No signal";
export const THEY_VALUE = "They value";
export const READ_SECTION_LABEL = "The read behind it";

/** The twelve archetypes alphabetically by label, each with its read (or 0% and no words). */
function allTwelve(read: ReadLine[]): ReadLine[] {
  return [...lenses]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((l) => read.find((r) => r.name === l.name) ?? { name: l.name, label: l.label, percent: 0, quotes: [] });
}

/**
 * The read, one tap in from the suggested approach (D: "The read is a suggested approach first").
 * Nothing here is deleted or hidden: the value word, the archetype label and its percentage, all
 * twelve archetypes alphabetically, the confidence words, and the customer's cited words are all
 * present. What changed is that they no longer headline a screen without their explanation, so the
 * sentence saying what the percentage measures sits above the list and is never separated from it.
 */
export function ReadBlock({ read, className, passageFor, contactName }: { read: ReadLine[]; className?: string; passageFor?: PassageFor; contactName?: string }) {
  const top = read[0];
  const list = allTwelve(read);
  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="read-block">
      <div className="flex flex-col">
        <span className="text-[11px] text-fg-subtle">{THEY_VALUE}</span>
        <span className={cn("text-[24px] font-semibold leading-tight tracking-tight", top ? "text-fg" : "text-fg-subtle")} data-testid="read-value">
          {top ? VALUE_WORD[top.name] : NO_SIGNAL_WORD}
        </span>
        {top ? (
          <span className="tabular text-[13px] text-fg-muted" data-testid="read-top">
            {top.label} · {top.percent}%
          </span>
        ) : null}
      </div>
      <p className="text-[12px] leading-snug text-fg-subtle" data-testid="read-meaning">
        {READ_MEASURE_SENTENCE}
      </p>
      <ul className="flex flex-col" data-testid="read-list">
        {list.map((r) => {
          const none = r.percent === 0;
          return (
            <li key={r.name} className={cn("flex flex-col gap-1 py-1.5", none && "opacity-60")} data-testid="read-row" data-signal={!none}>
              <div className="flex items-center gap-3">
                <span className="w-[92px] shrink-0 truncate text-[13px] text-fg">{r.label}</span>
                <ReadBar percent={r.percent} />
                <span className="tabular w-[96px] shrink-0 whitespace-nowrap text-right text-[12px] text-fg-muted">{none ? NO_SIGNAL_SHORT : `${r.percent}% ${confidenceWordFor(r.percent / 100)}`}</span>
              </div>
              {r.quotes.length > 0 ? <QuoteList quotes={r.quotes} passageFor={passageFor} contactName={contactName} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Lead with what to do. The kicker, the instruction as the biggest text, and one line saying
 * plainly that it is a tentative recommendation from an earlier conversation. Any further lines
 * follow it small. No value word, no archetype label, no percentage: those live one tap in.
 */
export function ApproachBlock({ approach, className }: { approach: string[]; className?: string }) {
  const [lead, ...rest] = approach;
  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="suggested-approach">
      <div className="flex flex-col">
        <span className="text-[11px] text-fg-subtle">{SUGGESTED_APPROACH_KICKER}</span>
        <span className={cn("text-[30px] font-semibold leading-tight tracking-tight", lead ? "text-fg" : "text-fg-subtle")} data-testid="approach-lead">
          {lead ?? NO_APPROACH_WORD}
        </span>
      </div>
      <p className="text-[12px] leading-snug text-fg-subtle" data-testid="approach-caveat">
        {APPROACH_TENTATIVE_SENTENCE}
      </p>
      {rest.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="approach">
          {rest.map((line) => (
            <li key={line} className="flex items-start gap-2 text-[14px] leading-snug text-fg">
              <ArrowRight size={13} weight="bold" aria-hidden className="mt-[3px] shrink-0 text-fg-subtle" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** First name only, for a button that has to name who it reaches. */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0];
}

/**
 * Who a question about this brief reaches, and what the button says. Never an unaddressed "Ask".
 * The setter of record first; otherwise the setter who last spoke to this customer, because the
 * words on this brief came from that call. With neither, the button names its effect instead.
 */
export function askTarget(item: UpcomingAppointment): { label: string; done: string } {
  const opportunityId = item.opportunity.opportunityId;
  const lastCaller = obaviaDataset.calls
    .filter((c) => c.opportunityId === opportunityId && c.transportState === "ended")
    .sort((a, b) => Date.parse(b.startedAt ?? "0") - Date.parse(a.startedAt ?? "0"))[0]?.userId;
  const id = item.opportunity.currentOwner.setter ?? lastCaller;
  const setter = id ? obaviaDataset.users.find((u) => u.userId === id && u.roles.includes("setter")) : undefined;
  if (setter) return { label: `Ask the setter, ${firstName(setter.displayName)}`, done: `Asked ${firstName(setter.displayName)}` };
  return { label: "Add missing context", done: "Context added" };
}

/**
 * Where a quoted customer span came from, built from the opportunity's own ended calls. The
 * reader stays on the brief: the passage opens in place with the cited turn highlighted, so no
 * observation depends on being allowed to open somebody else's call.
 */
export function usePassage(opportunityId: Id): PassageFor {
  return useMemo(() => {
    const index = new Map<string, Passage>();
    for (const { callId, transcript } of transcriptsFor(obaviaDataset, opportunityId)) {
      transcript.forEach((span, i) => {
        const key = span.text.trim();
        if (index.has(key)) return;
        const turns = [transcript[i - 1], span, transcript[i + 1]].filter(Boolean).map((t) => ({
          speaker: t.speaker ?? "unknown",
          text: t.text,
          startMs: t.startMs,
          cited: t.startMs === span.startMs && t.endMs === span.endMs,
        }));
        index.set(key, { callId, turns });
      });
    }
    return (quote: string) => index.get(quote.trim());
  }, [opportunityId]);
}

/**
 * Pre-call brief. Opens on the suggested approach: the instruction the closer should act on,
 * and one line saying it is a tentative reading of an earlier conversation. The read behind it
 * (the value word, the archetype label with its percentage, all twelve archetypes, the confidence
 * words, the cited words) and every other fact sit behind one Details row. Every assertion in
 * Details carries its provenance (SOS-10); no provenance tag shows on the first view.
 */
export function BriefSheet({ open, onClose, item, brief }: BriefSheetProps) {
  const [asked, setAsked] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const bm = brief.buyerMode;
  const approach = bm.approach.slice(0, 3);
  const description = item.contact.organizationName ? `${item.contact.displayName}, ${item.contact.organizationName}` : item.contact.displayName;
  const ask = askTarget(item);
  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Brief"
        description={description}
        footer={
          <Button variant="secondary" size="lg" className="w-full" disabled={asked} onClick={() => setAsked(true)} leading={<Question size={16} weight="bold" />} data-testid="brief-ask">
            {asked ? ask.done : ask.label}
          </Button>
        }
      >
        <section className="flex flex-col gap-3" aria-label="Suggested approach" data-testid="buyer-mode">
          <ApproachBlock approach={approach} />
          {bm.rows.length === 0 && bm.read.length === 0 ? (
            <p className="text-[13px] text-fg-subtle" data-testid="buyer-mode-empty">
              {NO_SIGNAL_WORD}
            </p>
          ) : null}
        </section>
        <div className="-mx-4 mt-3 border-t border-line sm:-mx-5">
          <DetailsRow label="Details" onClick={() => setDetailsOpen(true)} data-testid="brief-details-row" />
        </div>
      </Sheet>
      <BriefDetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} item={item} brief={brief} description={description} />
    </>
  );
}

/** The second sheet: the read behind the approach, then every fact, each with its provenance. */
function BriefDetailsSheet({ open, onClose, item, brief, description }: BriefSheetProps & { description: string }) {
  const [openRow, setOpenRow] = useState<string | undefined>(undefined);
  const lens = brief.lensHypothesis ? lensByName[brief.lensHypothesis] : undefined;
  const bm = brief.buyerMode;
  const passageFor = usePassage(item.opportunity.opportunityId);
  const toggle = (id: string) => setOpenRow((cur) => (cur === id ? undefined : id));
  return (
    <Sheet open={open} onClose={onClose} title="Details" description={description}>
      <div className="divide-y divide-line" data-testid="brief-details">
        {/* ----- The read: the labels and their percentages, with the sentence that says what they measure. ----- */}
        <section className="pb-2.5" aria-label="The read" data-testid="brief-read">
          <div className="section-label mb-1.5">{READ_SECTION_LABEL}</div>
          <ReadBlock read={bm.read} passageFor={passageFor} contactName={item.contact.displayName} />
        </section>

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

        {/* ----- Buyer mode dimensions: how they decide, from their words. Preferences fold in as evidence. ----- */}
        <section className="py-2.5" aria-label="Buyer mode dimensions" data-testid="buyer-mode-dimensions">
          <div className="mb-1 flex items-center justify-between">
            <span className="section-label">Buyer mode</span>
            {bm.rows.length === 0 ? null : <EvidenceTag label="Customer-stated" />}
          </div>
          {bm.rows.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">{NO_SIGNAL_WORD}</p>
          ) : (
            <ul className="flex flex-col">
              {bm.rows.map((r) => (
                <DimensionRow key={r.dimension} row={r} open={openRow === r.dimension} onToggle={() => toggle(r.dimension)} passageFor={passageFor} contactName={item.contact.displayName} />
              ))}
            </ul>
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
          <div className="py-2.5">
            <div className="section-label mb-1.5">Coaching lens (hypothesis)</div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium text-fg">{lens.label}</div>
                <div className="text-[12px] text-fg-muted">{lens.usefulAdaptation}</div>
              </div>
              <EvidenceTag label="AI-proposed" />
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
