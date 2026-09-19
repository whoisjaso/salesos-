/**
 * Personal Meaning Listener, rule-based slice (docs/sources/apohenia/Personal_Meaning_Listener_v3.md,
 * docs/LENS.md "The listener"). Notices the distinctive expression a prospect chose once,
 * keeps the exact words and the relationship they express, and offers one line later in
 * the prospect's own frame.
 *
 * Pure: no React, no fetch, no clock. Timestamps come from the transcript spans only.
 * Types come from src/content/frameworks/personalMeaningListener.ts and are not redefined.
 *
 * Rules baked in (LISTENER_RULES):
 * - Only a customer turn creates a reference. Seller repetition manufactures nothing.
 * - A first mention is eligible. Repetition raises occurrenceCount; it never gates.
 * - The relationship is preserved with the noun, and valence attaches to its object.
 * - Origin is spontaneous only when the rep's prior turns did not prime the domain.
 * - Meaning moves to confirmed only when the prospect explains it.
 * - Reuse retrieves by concept, never by matching nouns. Abstaining is valid.
 * - A suggestion never proposes price, discount, guarantee, or contract terms.
 * - Rejected, dismissed, and invalidated references are never suggested.
 */
import type {
  MeaningStatus,
  Origin,
  Reference,
  ReferenceKind,
  Valence,
} from "@/content/frameworks/personalMeaningListener";
import type { StageKey, TranscriptSpan } from "./callIntelligence";

// ---------- Types ----------

/** A reference that cites the transcript spans it was read from, so validation can check speaker ownership. */
export type CitedReference = Reference & { spans: TranscriptSpan[] };

export type ConceptTag =
  | "coordination"
  | "ownership"
  | "effort_then_failure"
  | "unexpected_cost_after_commitment"
  | "individuality_vs_structure"
  | "priority"
  /** Held, never reused: an analogy about a painful event (LISTENER_RULES: acknowledge neutrally, never elaborate). */
  | "painful_event";

export interface ExtractOptions {
  tenantId?: string;
  conversationId?: string;
  prospectSpeakerId?: string;
  transcriptRevision?: number;
  /** False when the transcript is a window without the preceding turns: origin then reads unknown, never spontaneous. */
  contextComplete?: boolean;
}

export interface ReuseSuggestion {
  referenceId: string;
  /** One line, grounded in the prospect's expression. */
  line: string;
  concept: ConceptTag;
}

export const REFERENCE_EXTRACTOR_VERSION = "references-rules-1.0";

// ---------- Detection tables ----------

/** Comparison markers. A closed list of markers, not a closed list of domains. */
const COMPARISON = /\b(like (?:a|an|the|when|running a|running an|spending|making|trying to|being|having|watching)|as bad as|as if|reminds me of|it'?s a [\w' -]+? where|it'?s an [\w' -]+? where|that'?s a [\w' -]+? where)\b/i;

/** Emotionally specific words: past participles of strong verbs plus a few states. Open-ended pattern, small seed. */
const EMOTIONAL = /\b(?:felt|feel|feeling|feels|was|were|got|been|are|am|i'm|we're|being)\s+(?:like\s+)?(?:(?:completely|totally|pretty|really|kind of|a bit)\s+)?(ambushed|blindsided|boxed in|cornered|drowning|stuck|burned|burnt|trapped|steamrolled|railroaded|ghosted|strung along|hung out to dry|left holding the bag)\b/i;

/** Explicit priority contrasts. */
const PRIORITY = [
  /\b([a-z]+) is what matters\b/i,
  /\b([a-z]+) matters(?: to (?:me|us))?, not ([a-z]+)\b/i,
  /\b(?:it'?s about|we care about|i care about|what i want is|what we want is|it'?s)\s+([a-z]+), not ([a-z]+)\b/i,
];

/** Commonplace idioms that carry no personal reference (rep speech or prospect speech). */
export const IDIOMS: readonly string[] = [
  "touch base",
  "ballpark",
  "slam dunk",
  "home run",
  "curveball",
  "level playing field",
  "move the needle",
  "in the same boat",
  "apples to apples",
  "low-hanging fruit",
  "par for the course",
  "drop the ball",
  "on the same page",
];

/** Rep questions that invite a comparison: the answer is prompted, not spontaneous. */
const PROMPT_QUESTION = /\b(what(?:'s| is| does) it (?:like|feel like)|how would you describe|what would you compare|compare it to|what'?s that like)\b/i;

/** Rep clarification of a term: the next explaining customer turn confirms the meaning. */
const CLARIFY = /\b(when you say|what do you mean|do you mean|was it that|what made it feel|which was it)\b/i;

/** A customer turn that explains a term. */
const EXPLAINS = /^\s*(?:well,?\s*|so,?\s*|honestly,?\s*|yeah,?\s*|yes,?\s*)?(by then|because|it meant|what i mean is|i mean|the thing is|it was that|it wasn't that)\b/i;

/** Attribution to someone else in the same sentence as the expression. */
const THIRD_PARTY = /\b(?:my|our|his|her|the)\s+(?:partner|business partner|wife|husband|boss|manager|gm|general manager|brother|sister|friend|buddy|accountant|controller|guy|kid|son|daughter|team lead|old boss)\b[^.;!?]*\b(?:says|said|calls|called|puts it|put it|describes|described|follows|thinks|told me|tells me|likes|loves|would say|keeps saying)\b/i;

const RELATIONSHIP_CONNECTOR = /\b(where|that|and|when)\b/i;

const NEGATIVE = /\b(nobody|no one|no-one|collapse|collapsed|collapsing|fail|failed|failing|broke|broken|breaking|bad|worst|worse|ambush|ambushed|blindsided|stuck|drowning|drown|mess|chaos|lose|lost|losing|wrong|nothing|never|can't|cannot|dies|died|dead|hurt|injury|burned|burnt|trapped|cornered|boxed in|falls through|fall through|fell through|scramble|scrambling|wants a solo|wants to play a solo|everybody wants)\b/i;
const POSITIVE = /\b(great|smooth|smoothly|easy|love|loved|perfect|clockwork|dream|works|worked|finally|relief|breathing room)\b/i;
const PAINFUL = /\b(breaking your leg|broke (?:my|his|her|a) leg|injury|injured|surgery|hospital|funeral|died|death|cancer|accident|crash|divorce)\b/i;

/** Known analogy domains for a clean label. Anything else keeps the spoken noun. */
const DOMAIN_LABEL: [RegExp, string][] = [
  [/\bhockey\b/i, "hockey"],
  [/\bjazz\b/i, "jazz"],
  [/\b(soufflé|souffle|oven|baking|bake|recipe|kitchen|cooking|chef)\b/i, "cooking"],
  [/\bbasketball\b/i, "basketball"],
  [/\bfootball\b/i, "football"],
  [/\bbaseball\b/i, "baseball"],
  [/\bsoccer\b/i, "soccer"],
  [/\bchess\b/i, "chess"],
  [/\b(garden|gardening|weeds|planting)\b/i, "gardening"],
  [/\b(construction|building a house|foundation|framing|contractor)\b/i, "construction"],
  [/\b(relay|baton)\b/i, "relay"],
  [/\b(orchestra|band|choir)\b/i, "music"],
  [/\b(pit crew|racing|race car)\b/i, "racing"],
  [/\b(fishing|fish)\b/i, "fishing"],
  [/\b(herding cats)\b/i, "herding cats"],
];

const FINANCE_TERM = /^(profit|margin|margins|revenue|cash|cashflow|volume|gross|net|turnover|units)$/i;

/** Concept tags read from the relationship, not the noun. */
const CONCEPT_FROM_RELATIONSHIP: [RegExp, ConceptTag][] = [
  [/\b(nobody knows who|no one knows who|who is defending|who's defending|who is covering|falls? through|fell through|handoff|hand-off|everyone assumes|nobody picks|nobody answers|no one answers|too many cooks|drops? the baton|holding the baton|nobody's holding)\b/i, "coordination"],
  [/\b(nobody owns|no one owns|nobody is responsible|who is responsible|whose job|nobody's job|nobody has it|nobody took)\b/i, "ownership"],
  [/\b(collapse|collapsed|fell apart|falls apart|flop|flopped|died|dead on arrival|watching it|all that work|all afternoon|all week|months of|never got off the ground)\b/i, "effort_then_failure"],
  [/\b(ambush|ambushed|blindsided|charges|charge|fees|fee|hidden|surprise|after we signed|after we committed|locked in|couldn't leave|could not leave|stuck with|strung along)\b/i, "unexpected_cost_after_commitment"],
  [/\b(solo|everybody wants|everyone wants|own way|their own thing|own style|herding cats|same sheet of music|freelancing)\b/i, "individuality_vs_structure"],
  [/\b(what matters|matters to me|matters to us|is what matters|priority|not revenue|not volume)\b/i, "priority"],
];

/** What a later turn is about. Concept keywords, no music words, no sports words. */
const CONCEPT_FROM_TURN: [RegExp, ConceptTag[]][] = [
  [/\b(robotic|robot|sound the same|same script|scripted|canned|cookie[- ]cutter|lose (?:their|the) personality|everyone sounds|all sound)\b/i, ["individuality_vs_structure"]],
  [/\b(who owns|who handles|who takes|who answers|who picks up|who covers|responsible|whose job|first response|hand ?off|when (?:your|the) (?:setter|rep|person) is out|falls? through)\b/i, ["coordination", "ownership"]],
  [/\b(fee|fees|charge|charges|contract|cancel|cancellation|lock(?:ed)? in|exit|extra cost|hidden cost|surprise cost|after we sign)\b/i, ["unexpected_cost_after_commitment"]],
  [/\b(launch|rollout|roll out|roll it out|go live|test it|test this|testing|pilot|first week|when we switch|switch over)\b/i, ["effort_then_failure"]],
  [/\b(profit|margin|margins|bottom line)\b/i, ["priority"]],
];

/** Words a suggestion may never contain (LISTENER_RULES: no discounts, guarantees, contract terms). */
export const FORBIDDEN_SUGGESTION = /\b(price|pricing|discount|guarantee|guaranteed|contract|refund|free|cheaper|per cent|percent|%|\$)/i;

// ---------- Helpers ----------

export function utteranceIdFor(conversationId: string, span: TranscriptSpan): string {
  return `${conversationId}:span:${span.startMs}-${span.endMs}`;
}

function startMsFromUtteranceId(utteranceId: string): number | undefined {
  const m = /:span:(\d+)-\d+$/.exec(utteranceId);
  return m ? Number(m[1]) : undefined;
}

function sentences(text: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  const re = /[^.!?;]+[.!?;]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].trim().length > 0) out.push({ text: m[0], offset: m.index });
  }
  return out;
}

function trimPunct(s: string): string {
  return s.replace(/^[\s,;:]+|[\s.,;:!?]+$/g, "");
}

function hasIdiom(text: string): boolean {
  const t = text.toLowerCase();
  return IDIOMS.some((i) => t.includes(i));
}

function domainOf(text: string): string {
  for (const [re, label] of DOMAIN_LABEL) if (re.test(text)) return label;
  return "";
}

/** The first plain noun after the article in "like a hockey team where ...". */
function nounAfterMarker(afterMarker: string): string {
  const words = afterMarker
    .replace(/^(running|spending|making|trying to|being|having|watching|when|a|an|the)\s+/i, "")
    .replace(/^(a|an|the|all|your|my|our)\s+/i, "")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter(Boolean);
  const stop = new Set(["where", "that", "and", "when", "with", "of", "in", "on", "to", "who", "which", "it", "you", "afternoon", "all", "day", "week", "morning"]);
  return words.find((w) => !stop.has(w.toLowerCase())) ?? "";
}

function relationshipClause(expression: string): string {
  const m = RELATIONSHIP_CONNECTOR.exec(expression);
  if (!m) return trimPunct(expression);
  // Prefer "where", then "that", then "and", then "when": the clause that carries the relationship.
  for (const word of ["where", "that", "and", "when"]) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    const mm = re.exec(expression);
    if (mm && mm.index > 0) {
      const clause = trimPunct(expression.slice(mm.index + mm[0].length));
      if (clause.split(/\s+/).length >= 2) return clause;
    }
  }
  return trimPunct(expression);
}

function targetBeforeMarker(before: string, turnText: string): string {
  let t = trimPunct(before)
    .replace(/\b(is|was|were|are|feels|felt|feel|seems|seemed|looks|looked|it's|its|that's|honestly|right now|basically)\s*$/i, "")
    .trim();
  t = trimPunct(t);
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 10) t = words.slice(-10).join(" ");
  if (t.length >= 3) return t.charAt(0).toLowerCase() + t.slice(1);
  const topic = trimPunct(sentences(turnText)[0]?.text ?? turnText).split(/\s+/).slice(0, 6).join(" ");
  return topic.charAt(0).toLowerCase() + topic.slice(1);
}

function valenceOf(expression: string, clause: string): { value: Valence; object: string } {
  const neg = NEGATIVE.test(expression);
  const pos = POSITIVE.test(expression);
  const value: Valence = neg && pos ? "mixed" : neg ? "negative" : pos ? "positive" : "neutral";
  return { value, object: clause };
}

function conceptsOf(relationship: string, expression: string): ConceptTag[] {
  const tags: ConceptTag[] = [];
  if (PAINFUL.test(expression)) tags.push("painful_event");
  for (const [re, tag] of CONCEPT_FROM_RELATIONSHIP) {
    if ((re.test(relationship) || re.test(expression)) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

const PURPOSE: Record<ConceptTag, string[]> = {
  coordination: ["discovery: who owns the first response", "pitch: the handoff"],
  ownership: ["discovery: who owns the inbox", "pitch: named ownership"],
  effort_then_failure: ["pitch: test the specific failure first", "objection: tried before"],
  unexpected_cost_after_commitment: ["pitch: full cost and change approval up front", "close: what must be clear before commitment"],
  individuality_vs_structure: ["pitch: shared process", "objection: sounding robotic"],
  priority: ["money outcomes: speak in the prospect's term"],
  painful_event: ["hold only: acknowledge neutrally, never reuse the image"],
};

const MAPPING: Record<ConceptTag, string> = {
  coordination: "the team = the floor; who is defending = who owns the first response",
  ownership: "the field = the inbox; the owner = one named person",
  effort_then_failure: "the effort = the rollout; the collapse = the moment real customers used it",
  unexpected_cost_after_commitment: "the ambush = a cost or change that arrived after commitment",
  individuality_vs_structure: "individual style = each rep's own voice; the shared arrangement = the shared process",
  priority: "the stated term is the subject; other figures are never relabeled as it",
  painful_event: "none: the image is not reused",
};

function prohibitedFor(kind: ReferenceKind, domain: string, concepts: ConceptTag[]): string[] {
  const out: string[] = ["biography or hobby", "why the expression was chosen"];
  if (kind === "analogy" && domain) out.push(`personal connection to ${domain}`, `technical ${domain} claims`, "shared experience");
  if (concepts.includes("painful_event")) out.push("an injury history", "dislike of the domain", "team preference", "gambling history");
  if (kind === "emotional_description") out.push("flattening to a generic objection", "the mechanism before the prospect states it");
  if (kind === "personally_defined_term") out.push("relabeling other figures as this term", "that the term will improve");
  return out;
}

interface Candidate {
  kind: ReferenceKind;
  expression: string;
  offset: number;
  domain: string;
  target: string;
  relationship: string;
  valence: { value: Valence; object: string };
  meaningStatus: MeaningStatus;
  sentence: string;
  /** Lowercased dedupe key: the domain for analogies, the word for terms. */
  key: string;
}

function analogyCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const s of sentences(text)) {
    const m = COMPARISON.exec(s.text);
    if (!m) continue;
    const marker = m[0];
    const start = m.index;
    const expression = trimPunct(s.text.slice(start));
    if (hasIdiom(expression)) continue;
    const afterMarker = expression.slice(marker.length).trim();
    if (afterMarker.split(/\s+/).filter(Boolean).length < 2) continue;
    const domain = domainOf(expression) || nounAfterMarker(afterMarker);
    if (!domain) continue;
    const relationship = relationshipClause(expression);
    const before = s.text.slice(0, start);
    const target = targetBeforeMarker(before, text);
    const valence = valenceOf(expression, relationship);
    out.push({
      kind: "analogy",
      expression,
      offset: s.offset + start,
      domain,
      target,
      relationship,
      valence,
      meaningStatus: "observed",
      sentence: s.text,
      key: `analogy:${domain.toLowerCase()}`,
    });
  }
  return out;
}

function emotionalCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const s of sentences(text)) {
    const m = EMOTIONAL.exec(s.text);
    if (!m) continue;
    const word = m[1];
    const wordOffset = s.text.indexOf(word, m.index);
    const after = trimPunct(s.text.slice(wordOffset + word.length));
    const objectMatch = /^(?:by|with|into|about|on|in)\s+(.+)$/i.exec(after);
    const target = objectMatch ? trimPunct(objectMatch[1]) : targetBeforeMarker(s.text.slice(0, m.index), text);
    out.push({
      kind: "emotional_description",
      expression: word,
      offset: s.offset + wordOffset,
      domain: "none",
      target,
      relationship: `${target} experienced as "${word}"; the mechanism is not yet stated`,
      valence: { value: "negative", object: `${target} and how it arrived` },
      meaningStatus: "inferred",
      sentence: s.text,
      key: `term:${word.toLowerCase()}`,
    });
  }
  return out;
}

function priorityCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  const sents = sentences(text);
  sents.forEach((s, i) => {
    for (const re of PRIORITY) {
      const m = re.exec(s.text);
      if (!m) continue;
      const term = m[1];
      let contrast = m[2];
      if (!contrast) {
        // "Revenue is fine. Profit is what matters." The earlier sentence names what it is not.
        const prev = sents[i - 1];
        const c = prev && /\b([a-z]+) (?:is|was|are|were) (?:fine|okay|ok|not the (?:problem|issue|point)|not it)\b/i.exec(prev.text);
        if (c) contrast = c[1];
      }
      const expression = trimPunct(s.text.slice(m.index));
      const domain = FINANCE_TERM.test(term) ? "finance" : "priority";
      out.push({
        kind: "personally_defined_term",
        expression,
        offset: s.offset + m.index,
        domain,
        target: term.toLowerCase(),
        relationship: contrast ? `${cap(term)} is the stated priority, explicitly distinguished from ${contrast.toLowerCase()}.` : `${cap(term)} is the stated priority.`,
        valence: { value: "neutral", object: contrast ? `the ${term.toLowerCase()} versus ${contrast.toLowerCase()} distinction` : `the ${term.toLowerCase()} priority` },
        meaningStatus: "confirmed",
        sentence: s.text,
        key: `term:${term.toLowerCase()}`,
      });
      break;
    }
  });
  return out;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** The rep turns that precede index i, most recent first, at most n. */
function priorRepTurns(transcript: TranscriptSpan[], i: number, n: number): TranscriptSpan[] {
  const out: TranscriptSpan[] = [];
  for (let j = i - 1; j >= 0 && out.length < n; j--) if (transcript[j].speaker === "rep") out.push(transcript[j]);
  return out;
}

function originOf(c: Candidate, transcript: TranscriptSpan[], i: number, contextComplete: boolean): Origin {
  if (THIRD_PARTY.test(c.sentence)) return "third_party";
  const prior = priorRepTurns(transcript, i, 2);
  const domainWord = c.kind === "analogy" ? c.domain : c.expression;
  const domainRe = new RegExp(`\\b${escapeRe(domainWord.split(/\s+/)[0])}`, "i");
  if (c.domain !== "none" && c.domain !== "priority" && prior.some((t) => domainRe.test(t.text))) return "seller_introduced_confirmed";
  if (c.kind !== "analogy" && prior.some((t) => new RegExp(`\\b${escapeRe(c.target.split(/\s+/)[0] ?? "")}\\b`, "i").test(t.text) && new RegExp(`\\b${escapeRe(c.expression.split(/\s+/)[0])}\\b`, "i").test(t.text))) {
    return "seller_introduced_confirmed";
  }
  if (prior.some((t) => PROMPT_QUESTION.test(t.text))) return "prompted";
  if (!contextComplete && prior.length === 0) return "unknown";
  return "prospect_spontaneous";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A later customer turn that explains the term: within 3 turns after a rep clarification
 * question that names the expression, starting with "by then", "because", "it meant", "what I mean is".
 */
function explanationFor(c: Candidate, transcript: TranscriptSpan[], i: number, conversationId: string): { text: string; utteranceId: string } | undefined {
  const word = c.expression.split(/\s+/)[0];
  const wordRe = new RegExp(`\\b${escapeRe(word)}\\b`, "i");
  for (let j = i + 1; j < transcript.length; j++) {
    const t = transcript[j];
    if (t.speaker !== "rep" || !CLARIFY.test(t.text) || !wordRe.test(t.text)) continue;
    for (let k = j + 1; k < Math.min(transcript.length, j + 4); k++) {
      const u = transcript[k];
      if (u.speaker === "customer" && EXPLAINS.test(u.text)) return { text: u.text.trim(), utteranceId: utteranceIdFor(conversationId, u) };
    }
  }
  return undefined;
}

// ---------- Extraction ----------

/**
 * Deterministic first-mention extraction over customer turns. Every reference cites the
 * span it was read from. Duplicate mentions raise occurrenceCount, never a second card.
 */
export function extractReferences(transcript: TranscriptSpan[], opts: ExtractOptions = {}): CitedReference[] {
  const tenantId = opts.tenantId ?? "unknown";
  const conversationId = opts.conversationId ?? "conversation";
  const prospectSpeakerId = opts.prospectSpeakerId ?? "customer";
  const revision = opts.transcriptRevision ?? 1;
  const contextComplete = opts.contextComplete ?? true;
  const out: CitedReference[] = [];
  const byKey = new Map<string, CitedReference>();

  transcript.forEach((span, i) => {
    if (span.speaker !== "customer" || typeof span.text !== "string") return;
    if (!Number.isFinite(span.startMs) || !Number.isFinite(span.endMs)) return;
    const candidates = [...analogyCandidates(span.text), ...emotionalCandidates(span.text), ...priorityCandidates(span.text)].sort((a, b) => a.offset - b.offset);
    const utteranceId = utteranceIdFor(conversationId, span);
    for (const c of candidates) {
      const existing = byKey.get(c.key);
      if (existing) {
        existing.lifecycle.occurrenceCount += 1;
        existing.lifecycle.lastObservedTurn = utteranceId;
        continue;
      }
      const origin = originOf(c, transcript, i, contextComplete);
      const concepts = conceptsOf(c.relationship, c.expression);
      const explained = c.meaningStatus === "confirmed" ? undefined : explanationFor(c, transcript, i, conversationId);
      const referenceId = `${conversationId}:ref:${span.startMs}-${span.endMs}:${c.offset}`;
      const ref: CitedReference = {
        identity: {
          tenantId,
          conversationId,
          prospectSpeakerId,
          referenceId,
          createdEventVersion: revision,
          updatedEventVersion: revision,
          schemaVersion: 1,
          extractorVersion: REFERENCE_EXTRACTOR_VERSION,
        },
        evidence: {
          exactExpression: c.expression,
          exactQuote: span.text.trim(),
          utteranceId,
          offsets: { start: c.offset, end: c.offset + c.expression.length },
          transcriptRevision: revision,
          status: "final",
          turnStartMs: span.startMs,
        },
        semantics: {
          kind: c.kind,
          sourceDomain: c.domain,
          describedTarget: c.target,
          comparisonRelationship: c.relationship,
          valence: c.valence,
          origin,
          meaningStatus: explained ? "confirmed" : c.meaningStatus,
          explainedMeaning: explained,
          prohibitedInferences: prohibitedFor(c.kind, c.domain, concepts),
        },
        lifecycle: {
          firstObservedTurn: utteranceId,
          lastObservedTurn: utteranceId,
          occurrenceCount: 1,
          state: "held",
          corrections: [],
        },
        reuse: {
          candidatePurposes: concepts.flatMap((t) => PURPOSE[t]),
          relevanceExplanation: concepts.length > 0 ? `Concept: ${concepts.join(", ")}.` : "No reusable concept read from the relationship; held as evidence only.",
          allowedContextualMapping: concepts.map((t) => MAPPING[t]).join("; ") || "none",
          usedAt: [],
          reaction: "unknown",
        },
        spans: [span],
      };
      byKey.set(c.key, ref);
      out.push(ref);
    }
  });
  return out;
}

/** Concept tags for a reference, read from its relationship and expression. */
export function conceptsFor(reference: Reference): ConceptTag[] {
  return conceptsOf(reference.semantics.comparisonRelationship, reference.evidence.exactExpression);
}

/** Concept tags a turn is about, from the keyword table. */
export function conceptsInTurn(text: string): ConceptTag[] {
  const tags: ConceptTag[] = [];
  for (const [re, list] of CONCEPT_FROM_TURN) if (re.test(text)) for (const t of list) if (!tags.includes(t)) tags.push(t);
  return tags;
}

// ---------- Reuse ----------

function reusable(r: Reference): boolean {
  const s = r.lifecycle.state;
  if (s === "rejected" || s === "dismissed" || s === "invalidated") return false;
  if (r.reuse.reaction === "rejected") return false;
  if (r.semantics.origin === "third_party" || r.semantics.origin === "unknown") return false;
  if (r.evidence.status === "corrected") return false;
  return true;
}

function lineFor(r: Reference, concept: ConceptTag): string | undefined {
  const domain = r.semantics.sourceDomain;
  const word = r.evidence.exactExpression;
  const term = r.semantics.describedTarget;
  switch (concept) {
    case "coordination":
    case "ownership":
      return `Using your ${domain} example, who should own the first response, and who covers it when that person is unavailable?`;
    case "individuality_vs_structure":
      return `Going back to your ${domain} example, the idea would be to keep each person's own style while giving everyone the same arrangement to follow. Which parts of the follow-up need that shared structure?`;
    case "effort_then_failure":
      return `Using your ${domain} comparison, what failed when real customers started using it? That specific situation is the one to test first.`;
    case "unexpected_cost_after_commitment":
      return `You said you felt "${word}" last time. Which costs and changes should be spelled out before you commit, so nothing lands after?`;
    case "priority":
      return `You said ${term} is what matters. Which ${term} definition do you use, so the conversation stays in ${term} terms?`;
    case "painful_event":
      return undefined;
  }
}

/**
 * At most one line for the current turn, retrieved by concept and grounded in the
 * prospect's own expression. Null when nothing matches, when the reference is not
 * reusable, when the turn is the reference's own, or when the line would name price,
 * discount, guarantee, or contract terms.
 */
export function suggestReuse(references: readonly Reference[], currentTurn: TranscriptSpan, stage: StageKey): ReuseSuggestion | null {
  const wanted = conceptsInTurn(currentTurn.text);
  if (wanted.length === 0) return null;
  if (stage === "contacted" && wanted.every((t) => t === "priority")) return null;
  for (const r of references) {
    if (!reusable(r)) continue;
    const own = utteranceIdFor(r.identity.conversationId, currentTurn);
    if (r.evidence.utteranceId === own) continue;
    const refStart = startMsFromUtteranceId(r.evidence.utteranceId);
    if (refStart !== undefined && currentTurn.startMs <= refStart) continue;
    const tags = conceptsFor(r);
    if (tags.includes("painful_event")) continue;
    const concept = wanted.find((t) => tags.includes(t));
    if (!concept) continue;
    const line = lineFor(r, concept);
    if (!line || FORBIDDEN_SUGGESTION.test(line)) continue;
    return { referenceId: r.identity.referenceId, line, concept };
  }
  return null;
}

// ---------- Lifecycle ----------

function withState<R extends Reference>(r: R, state: Reference["lifecycle"]["state"], reason?: string): R {
  return { ...r, lifecycle: { ...r.lifecycle, state, stateReason: reason } };
}

/** Pinning protects position; it does not certify accuracy. */
export function pin<R extends Reference>(r: R, reason = "kept for later"): R {
  return withState(r, "pinned", reason);
}

export function unpin<R extends Reference>(r: R): R {
  return withState(r, "held", undefined);
}

/** Dismissed: off the cards, not reused. */
export function dismiss<R extends Reference>(r: R, reason = "dismissed by rep"): R {
  return withState(r, "dismissed", reason);
}

/** Rejected: the prospect or the rep said not this. Reuse stops; history stays. */
export function reject<R extends Reference>(r: R, reason = "do not reuse this reference"): R {
  return { ...withState(r, "rejected", reason), reuse: { ...r.reuse, reaction: "rejected" } };
}

/**
 * A transcript revision that retracts the phrase invalidates the reference visibly: state
 * invalidated, evidence corrected, a correction entry. An intact phrase leaves it unchanged.
 */
export function invalidateOnRetraction<R extends Reference>(r: R, revisedTranscript: TranscriptSpan[], revision = r.evidence.transcriptRevision + 1): R {
  const start = startMsFromUtteranceId(r.evidence.utteranceId);
  const span = revisedTranscript.find((s) => utteranceIdFor(r.identity.conversationId, s) === r.evidence.utteranceId || (start !== undefined && s.startMs === start));
  const intact = Boolean(span && span.speaker === "customer" && span.text.includes(r.evidence.exactExpression));
  if (intact) return r;
  return {
    ...r,
    identity: { ...r.identity, updatedEventVersion: revision },
    evidence: { ...r.evidence, status: "corrected", transcriptRevision: revision },
    lifecycle: {
      ...r.lifecycle,
      state: "invalidated",
      stateReason: "transcript revision retracted the phrase",
      corrections: [...r.lifecycle.corrections, { atEventVersion: revision, note: `retracted in transcript revision ${revision}` }],
    },
  };
}

// ---------- Words ----------

export const ORIGIN_WORD: Record<Origin, string> = {
  prospect_spontaneous: "Spontaneous",
  prompted: "Prompted",
  seller_introduced_confirmed: "Shared",
  third_party: "Third party",
  unknown: "Unknown",
};

export const MEANING_WORD: Record<MeaningStatus, string> = {
  observed: "Observed",
  inferred: "Inferred",
  confirmed: "Confirmed",
  unknown: "Unknown",
};
