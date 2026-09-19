/**
 * Buyer Mode: how this customer decides, read from their own words (docs/POSITIONING.md
 * "Buyer Mode"; D: "Positioning: a measurable, self-improving game"; SOS-07, SOS-08).
 *
 * Nine dimensions, each a short value word with a confidence and the customer spans it came
 * from. The output for the closer is a best-approach list, never a type label. Archetypes stay
 * an internal lens (src/content/lenses.ts) and never appear here.
 *
 * Rules baked in:
 * - Only a customer turn is evidence. Rep speech never counts, however leading.
 * - Unknown is a valid answer and carries confidence 0 and no spans.
 * - Every non-Unknown value cites at least one customer span.
 * - An explicit statement outranks a hint; a competing value never adds up, the stronger one wins.
 * - "My partner and I" is not a dimension value. It lowers control confidence, cited.
 * - A communication profile's explicit preferences are the customer's own stated words and boost
 *   a matching dimension; they never establish a value the transcript contradicts at higher confidence.
 * - Approach lines come only from dimensions at or above CONFIDENT, and never from a name, voice,
 *   accent, or appearance (SOS-07, SOS-23).
 *
 * Pure: no React, no fetch, no clock.
 */
import type { TranscriptSpan } from "./callIntelligence";
import type { CommunicationProfile, LensName } from "./types";

// ---------- Types ----------

export type BuyerModeDimension =
  | "decisionSpeed"
  | "evidencePreference"
  | "riskSensitivity"
  | "controlOrientation"
  | "detailAppetite"
  | "socialProofNeed"
  | "primaryMotivation"
  | "primaryFriction"
  | "communicationStyle";

export const BUYER_MODE_DIMENSIONS: readonly BuyerModeDimension[] = [
  "decisionSpeed",
  "evidencePreference",
  "riskSensitivity",
  "controlOrientation",
  "detailAppetite",
  "socialProofNeed",
  "primaryMotivation",
  "primaryFriction",
  "communicationStyle",
];

/** Labels, not sentences. */
export const BUYER_MODE_LABEL: Record<BuyerModeDimension, string> = {
  decisionSpeed: "Decision speed",
  evidencePreference: "Evidence preference",
  riskSensitivity: "Risk sensitivity",
  controlOrientation: "Control orientation",
  detailAppetite: "Detail appetite",
  socialProofNeed: "Social proof need",
  primaryMotivation: "Primary motivation",
  primaryFriction: "Primary friction",
  communicationStyle: "Communication style",
};

export interface BuyerModeValue {
  /** A short word: Fast, Slow, Quantitative, Stories, Low, Medium, High, Growth, Trust, Direct, Unknown. */
  value: string;
  /** 0..1. Unknown is always 0. */
  confidence: number;
  /** Customer spans the value was read from. Empty only for Unknown. */
  spans: TranscriptSpan[];
}

export const BUYER_MODE_VERSION = "buyer-mode-1.0" as const;

export type BuyerMode = Record<BuyerModeDimension, BuyerModeValue> & {
  version: typeof BUYER_MODE_VERSION;
  /** At most MAX_APPROACH short imperative lines, from dimensions at or above CONFIDENT only. */
  approach: string[];
};

export const UNKNOWN_VALUE = "Unknown";
/** A dimension at or above this confidence earns an approach line and a filled dot. */
export const CONFIDENT = 0.6;
export const MAX_APPROACH = 6;

export function unknownValue(): BuyerModeValue {
  return { value: UNKNOWN_VALUE, confidence: 0, spans: [] };
}

/** All nine Unknown, no approach. The default on every extraction. */
export function emptyBuyerMode(): BuyerMode {
  return {
    version: BUYER_MODE_VERSION,
    approach: [],
    decisionSpeed: unknownValue(),
    evidencePreference: unknownValue(),
    riskSensitivity: unknownValue(),
    controlOrientation: unknownValue(),
    detailAppetite: unknownValue(),
    socialProofNeed: unknownValue(),
    primaryMotivation: unknownValue(),
    primaryFriction: unknownValue(),
    communicationStyle: unknownValue(),
  };
}

export function isConfident(v: BuyerModeValue): boolean {
  return v.value !== UNKNOWN_VALUE && v.confidence >= CONFIDENT;
}

// ---------- Rules ----------

interface Rule {
  dimension: BuyerModeDimension;
  value: string;
  confidence: number;
  pattern: RegExp;
}

/**
 * Explicit statements score highest (0.85 to 0.9); hints lower. Matched against customer turns
 * and explicit profile preferences only. Order matters only for ties, resolved by transcript position.
 */
const RULES: readonly Rule[] = [
  // Decision speed
  { dimension: "decisionSpeed", value: "Fast", confidence: 0.85, pattern: /\b(how (fast|soon|quickly) can (we|i) (start|get going|begin|go live)|when can we start|let'?s (do it|get started|get going|go)|ready to (go|start|move)|as soon as possible|\basap\b|(this|next) week if|start (this|next) week|today if)\b/i },
  { dimension: "decisionSpeed", value: "Slow", confidence: 0.75, pattern: /\b(no (hurry|rush)|not in a (hurry|rush)|take (my|our|some) time|think (it|this|that) over|sleep on it|revisit (it |this )?(later|next)|next (quarter|year)|in a few months|not (right now|this year)|down the road)\b/i },
  // Evidence preference
  { dimension: "evidencePreference", value: "Quantitative", confidence: 0.9, pattern: /\b(send (me|us) the numbers|numbers first|show (me|us) the (numbers|data|results|figures)|what are the numbers|see (the |some |actual )?numbers|want to see numbers|the (data|stats|metrics|figures)\b|\broi\b)/i },
  { dimension: "evidencePreference", value: "Stories", confidence: 0.8, pattern: /\b(walk me through|show (me|us) (how it works|what .{0,30}sees|it working)|see (how it works|it in action)|give me an example|an example of|what happened (at|with) (a|another|one)|tell me about a (store|dealer|customer))\b/i },
  // Risk sensitivity
  { dimension: "riskSensitivity", value: "High", confidence: 0.85, pattern: /\b(what happens (if|when) (it|this|that) (breaks|fails|goes down|stops)|guarantee|what if it (fails|doesn'?t work|breaks)|burned us|been burned|worried about|what'?s the risk|can we (cancel|get out)|locked in|lock us in|ambushed)\b/i },
  { dimension: "riskSensitivity", value: "Medium", confidence: 0.6, pattern: /\b(not sure (about|it|this|the)|hesitant|some concerns?|a bit (worried|concerned|nervous))\b/i },
  { dimension: "riskSensitivity", value: "Low", confidence: 0.7, pattern: /\b(not worried|i'?m not (too )?concerned|doesn'?t bother me|we'?ll figure it out|let'?s just try it|happy to try)\b/i },
  // Control orientation
  { dimension: "controlOrientation", value: "High", confidence: 0.85, pattern: /\b(i decide|my call|my decision|i make the (call|decision|decisions)|i sign (for|off)|i'?ll decide|up to me|(?<!and )i run (this|the) (place|store|show)|i'?m the one who (decides|signs))\b/i },
  { dimension: "controlOrientation", value: "Low", confidence: 0.75, pattern: /\b((partner|boss|gm|owner|manager|wife|husband|board|controller) (decides|handles that|signs|makes the call|has to (approve|sign))|i don'?t sign|not my (call|decision)|have to (ask|check with|run it by)|need (his|her|their) (ok|okay|sign-?off|approval)|takes? it to my (partner|boss|owner))\b/i },
  // Detail appetite
  { dimension: "detailAppetite", value: "Low", confidence: 0.85, pattern: /\b(short version|keep it (tight|short|brief|quick)|bottom line|skip the (details|backstory|slides|slideshow)|don'?t need the (details|slideshow|slides|pitch)|just tell me|cut to the chase|high level|in a nutshell|not a pitch)\b/i },
  { dimension: "detailAppetite", value: "High", confidence: 0.8, pattern: /\b(every (fee|line|step|detail)|all the details|the fine print|line by line|full breakdown|how exactly|the specifics|in detail|walk me through (every|each|all))\b/i },
  // Social proof need
  { dimension: "socialProofNeed", value: "High", confidence: 0.85, pattern: /\b(who else (uses|is using|has|runs|is on)|other (dealers|stores|dealerships|customers|groups) (use|using|on|have)|anyone (else )?(like us|in our)|references|reviews|testimonials|what (other|another) (store|dealer|group)s? (did|does|do)|dealers (near|around) (us|here))\b/i },
  { dimension: "socialProofNeed", value: "Low", confidence: 0.7, pattern: /\b(don'?t care who else|doesn'?t matter who else|don'?t need references|not interested in who else)\b/i },
  // Primary motivation
  { dimension: "primaryMotivation", value: "Growth", confidence: 0.8, pattern: /\b(grow|growth|more (leads|sales|appointments|deals|volume|units|traffic)|sell more|expand|expanding|second (store|rooftop)|scale up)\b/i },
  { dimension: "primaryMotivation", value: "Time", confidence: 0.8, pattern: /\b(save (us |me )?time|less work|fewer steps|stop chasing|off my plate|nothing (for them|to log)|nobody has to log|chase them for us|goes? cold|sit(s|ting)? (overnight|there|all night)|never hear from us)\b/i },
  { dimension: "primaryMotivation", value: "Savings", confidence: 0.75, pattern: /\b(save (us |me )?money|cut costs?|spending too much|cheaper than|replace (what|the tool|our))\b/i },
  // Primary friction
  { dimension: "primaryFriction", value: "Trust", confidence: 0.85, pattern: /\b(burned us|been burned|ambushed|felt (burned|cheated|misled)|(agency|vendor|company|guy|rep) (burned|screwed|misled|lied to|let .{0,10} down)|don'?t trust|over-?promised|didn'?t deliver)\b/i },
  { dimension: "primaryFriction", value: "Price", confidence: 0.8, pattern: /\b(too expensive|too much (money|for)|can'?t afford|the number'?s (not )?right|not sure the number|over budget|out of (our|my) budget|too pricey)\b/i },
  { dimension: "primaryFriction", value: "Adoption", confidence: 0.8, pattern: /\b(nobody (logs? in|logged in|did it|uses it|used it)|another (tool|dashboard|screen) nobody|my (people|team|salespeople|guys) (won'?t|don'?t|never)|screen for them to ignore|dead on arrival|get (them|the team|the floor) to (use|log|adopt)|died in a month)\b/i },
  { dimension: "primaryFriction", value: "Timing", confidence: 0.7, pattern: /\b(no time|too busy|bad time|busy right now|not a good time|swamped|short-?staffed)\b/i },
  // Communication style
  { dimension: "communicationStyle", value: "Direct", confidence: 0.8, pattern: /\b(keep it (tight|short|quick|brief)|get to the point|tell (me|you) straight|straight answer|cut to the chase|don'?t waste (my|your) time|just (give|tell) me|no pitch)\b/i },
  { dimension: "communicationStyle", value: "Conversational", confidence: 0.7, pattern: /\b(it'?s like (a|an|running|when)|like a [\w' -]+? where|reminds me of|funny (thing|story)|let me tell you|long story short)\b/i },
  { dimension: "communicationStyle", value: "Written", confidence: 0.7, pattern: /\b(put it in writing|in writing|send it (in|by) email|email me the|send (it|the invite|that) to (the|my) (store |office |dealer group )?email|email summar(y|ies)|through my office|my office manager)\b/i },
];

/** Joint decision authority: not a value. It lowers control confidence and is cited. */
const JOINT = /\b(my (partner|wife|husband|brother|sister|co-?owner) and (i|me)|we both (decide|sign|run)|both of us|the two of us (decide|run|own)|(he|she|they) and i (decide|run|own))\b/i;
const JOINT_CONFIDENCE = 0.5;
const PROFILE_BOOST = 0.1;
const PROFILE_ONLY_FACTOR = 0.8;
const MAX_CONFIDENCE = 0.95;

const round2 = (n: number) => Math.round(n * 100) / 100;

function customerSpanOk(s: TranscriptSpan): boolean {
  return (
    typeof s === "object" && s !== null && s.speaker === "customer" &&
    Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.startMs >= 0 && s.endMs >= s.startMs &&
    typeof s.text === "string" && s.text.trim().length > 0
  );
}

function spanKey(s: TranscriptSpan): string {
  return `${s.startMs}-${s.endMs}:${s.text}`;
}

export function unionSpans(a: TranscriptSpan[], b: TranscriptSpan[]): TranscriptSpan[] {
  const seen = new Set<string>();
  const out: TranscriptSpan[] = [];
  for (const s of [...a, ...b]) {
    const k = spanKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

interface Candidate {
  value: string;
  confidence: number;
  spans: TranscriptSpan[];
  /** Transcript position of the first hit, for deterministic ties. */
  order: number;
}

/** A preference the customer stated (CommunicationProfile.explicitPreferences) as a cited customer span at t=0. */
export function preferenceSpan(text: string): TranscriptSpan {
  return { startMs: 0, endMs: 0, text, speaker: "customer" };
}

/**
 * Deterministic: customer turns only, explicit statements first, Unknown when silent.
 * `profile.explicitPreferences` (the customer's own stated preferences, SOS-07) boost a matching
 * dimension by PROFILE_BOOST, or establish it at a reduced confidence when the transcript is silent.
 */
export function inferBuyerMode(transcript: TranscriptSpan[], profile?: CommunicationProfile): BuyerMode {
  const customer = transcript.filter(customerSpanOk);
  const mode = emptyBuyerMode();

  // Transcript candidates: per dimension, per value.
  const candidates = new Map<BuyerModeDimension, Map<string, Candidate>>();
  const add = (rule: Rule, span: TranscriptSpan, order: number) => {
    const byValue = candidates.get(rule.dimension) ?? new Map<string, Candidate>();
    const c = byValue.get(rule.value);
    if (c) c.spans = unionSpans(c.spans, [span]);
    else byValue.set(rule.value, { value: rule.value, confidence: rule.confidence, spans: [span], order });
    candidates.set(rule.dimension, byValue);
  };
  customer.forEach((span, i) => {
    for (const rule of RULES) if (rule.pattern.test(span.text)) add(rule, span, i);
  });

  // Profile preferences: boost a matching transcript value, or stand in at reduced confidence.
  const prefSpans = (profile?.explicitPreferences ?? []).map((p) => p.text).filter((t) => typeof t === "string" && t.trim().length > 0).map(preferenceSpan);
  prefSpans.forEach((span, i) => {
    for (const rule of RULES) {
      if (!rule.pattern.test(span.text)) continue;
      const byValue = candidates.get(rule.dimension) ?? new Map<string, Candidate>();
      const c = byValue.get(rule.value);
      if (c) {
        c.confidence = Math.min(MAX_CONFIDENCE, round2(c.confidence + PROFILE_BOOST));
        c.spans = unionSpans(c.spans, [span]);
      } else {
        byValue.set(rule.value, { value: rule.value, confidence: round2(rule.confidence * PROFILE_ONLY_FACTOR), spans: [span], order: customer.length + i });
      }
      candidates.set(rule.dimension, byValue);
    }
  });

  // Pick the strongest value per dimension: confidence, then more spans, then earliest.
  for (const dimension of BUYER_MODE_DIMENSIONS) {
    const byValue = candidates.get(dimension);
    if (!byValue || byValue.size === 0) continue;
    const best = [...byValue.values()].sort((a, b) => b.confidence - a.confidence || b.spans.length - a.spans.length || a.order - b.order)[0];
    mode[dimension] = { value: best.value, confidence: best.confidence, spans: best.spans };
  }

  // Joint decision authority lowers control confidence and is cited. Alone it reads Medium, low confidence.
  const joint = customer.filter((s) => JOINT.test(s.text));
  if (joint.length > 0) {
    const control = mode.controlOrientation;
    if (control.value === UNKNOWN_VALUE) {
      mode.controlOrientation = { value: "Medium", confidence: JOINT_CONFIDENCE, spans: joint };
    } else {
      mode.controlOrientation = { value: control.value, confidence: Math.min(control.confidence, control.value === "Low" ? CONFIDENT : JOINT_CONFIDENCE), spans: unionSpans(control.spans, joint) };
    }
  }

  mode.approach = approachFor(mode);
  return mode;
}

// ---------- Approach ----------

/** Short imperative lines. Never an archetype name, never a trait. */
const APPROACH: Partial<Record<BuyerModeDimension, Record<string, string>>> = {
  evidencePreference: { Quantitative: "Lead with the numbers", Stories: "Show it working before the numbers" },
  decisionSpeed: { Fast: "Name the next step on this call", Slow: "Name the downside of waiting" },
  riskSensitivity: { High: "Say what happens if it breaks, and who fixes it", Medium: "Name the one thing they are unsure about" },
  controlOrientation: { High: "Give two options, not six", Medium: "Bring the partner into the next call", Low: "Bring the partner into the next call" },
  detailAppetite: { Low: "Answer directly, skip the backstory", High: "Bring the full breakdown, every line" },
  socialProofNeed: { High: "Show one comparable dealer, not a list" },
  primaryMotivation: { Growth: "Tie every point to more leads worked", Time: "Tie every point to less chasing", Savings: "Tie every point to what it replaces" },
  primaryFriction: { Trust: "Put every cost on the table first", Price: "Hold the price, show what it buys", Adoption: "Show what the salesperson sees", Timing: "Keep it to fifteen minutes" },
  communicationStyle: { Direct: "Answer directly, skip the backstory", Conversational: "Use their own comparison back", Written: "Follow up in writing the same day" },
};

/** Lines from confident dimensions only, strongest first, deduplicated, at most MAX_APPROACH. */
export function approachFor(mode: Record<BuyerModeDimension, BuyerModeValue>): string[] {
  const ranked = BUYER_MODE_DIMENSIONS
    .map((d, i) => ({ d, i, v: mode[d] }))
    .filter(({ v }) => v && isConfident(v))
    .sort((a, b) => b.v.confidence - a.v.confidence || a.i - b.i);
  const out: string[] = [];
  for (const { d, v } of ranked) {
    const line = APPROACH[d]?.[v.value];
    if (line && !out.includes(line)) out.push(line);
    if (out.length >= MAX_APPROACH) break;
  }
  return out;
}

// ---------- Merge ----------

/**
 * Evidence accumulates across calls: per dimension the higher confidence wins (ties keep `prev`),
 * and when both read the same value their spans union. Approach is recomputed from the result.
 */
export function mergeBuyerMode(prev: BuyerMode, next: BuyerMode): BuyerMode {
  const merged = emptyBuyerMode();
  for (const d of BUYER_MODE_DIMENSIONS) {
    const a = prev[d] ?? unknownValue();
    const b = next[d] ?? unknownValue();
    if (a.value === b.value) {
      merged[d] = a.value === UNKNOWN_VALUE ? unknownValue() : { value: a.value, confidence: Math.max(a.confidence, b.confidence), spans: unionSpans(a.spans, b.spans) };
    } else if (a.value === UNKNOWN_VALUE) {
      merged[d] = { ...b, spans: [...b.spans] };
    } else if (b.value === UNKNOWN_VALUE) {
      merged[d] = { ...a, spans: [...a.spans] };
    } else {
      const winner = b.confidence > a.confidence ? b : a;
      merged[d] = { value: winner.value, confidence: winner.confidence, spans: [...winner.spans] };
    }
  }
  merged.approach = approachFor(merged);
  return merged;
}

// ---------- Validation ----------

const ARCHETYPE_WORD = /\b(competence|autonomy|safety|achievement|significance|connection|approval|care|provider|novelty|efficiency|legacy|archetype|type)\b/i;

/**
 * Errors, empty when valid. Every non-Unknown value cites at least one span the customer spoke;
 * Unknown carries confidence 0; approach lines are at most MAX_APPROACH and never a type label.
 */
export function validateBuyerMode(mode: unknown): string[] {
  const errors: string[] = [];
  if (typeof mode !== "object" || mode === null || Array.isArray(mode)) return ["buyerMode is not an object"];
  const m = mode as Record<string, unknown>;
  if (m.version !== BUYER_MODE_VERSION) errors.push(`buyerMode.version must be ${BUYER_MODE_VERSION}`);
  for (const d of BUYER_MODE_DIMENSIONS) {
    const v = m[d] as Partial<BuyerModeValue> | undefined;
    if (!v || typeof v !== "object") { errors.push(`buyerMode.${d} is missing`); continue; }
    if (typeof v.value !== "string" || !v.value.trim()) { errors.push(`buyerMode.${d} has no value`); continue; }
    if (typeof v.confidence !== "number" || !Number.isFinite(v.confidence) || v.confidence < 0 || v.confidence > 1) errors.push(`buyerMode.${d} confidence must be a number from 0 to 1`);
    if (v.value === UNKNOWN_VALUE) {
      if (v.confidence !== 0) errors.push(`buyerMode.${d} Unknown must carry confidence 0`);
      continue;
    }
    if (ARCHETYPE_WORD.test(v.value)) errors.push(`buyerMode.${d} "${v.value}" is a type label, not a buyer mode value`);
    if (!Array.isArray(v.spans) || v.spans.length === 0) errors.push(`buyerMode.${d} "${v.value}" asserted without a customer span`);
    else if (!v.spans.every(customerSpanOk)) errors.push(`buyerMode.${d} "${v.value}" cites a span the customer did not speak`);
  }
  if (!Array.isArray(m.approach)) errors.push("buyerMode.approach must be an array");
  else {
    if (m.approach.length > MAX_APPROACH) errors.push(`buyerMode.approach has more than ${MAX_APPROACH} lines`);
    m.approach.forEach((line, i) => {
      if (typeof line !== "string" || !line.trim()) errors.push(`buyerMode.approach[${i}] is empty`);
      else if (ARCHETYPE_WORD.test(line)) errors.push(`buyerMode.approach[${i}] names a type label`);
    });
  }
  return errors;
}

/** Dimensions with a known value, strongest first, then dimension order. */
export function knownDimensions(mode: BuyerMode): BuyerModeDimension[] {
  return BUYER_MODE_DIMENSIONS
    .map((d, i) => ({ d, i, v: mode[d] }))
    .filter(({ v }) => v.value !== UNKNOWN_VALUE)
    .sort((a, b) => b.v.confidence - a.v.confidence || a.i - b.i)
    .map(({ d }) => d);
}

// ---------- Archetype read (internal lens, shown as "Read", never "type") ----------

/**
 * One archetype hypothesis with how strongly the customer's own words support it. The lens
 * library (src/content/lenses.ts, SOS-07) stays a hypothesis: a probability is the weight of the
 * evidence, never a diagnosis. Every entry cites customer spans.
 */
export interface ArchetypeRead {
  name: LensName;
  /** 0..1 */
  probability: number;
  spans: TranscriptSpan[];
}

export const MAX_ARCHETYPE_READ = 4;
/** Entries below this are dropped: not enough words to believe anything. */
export const MIN_ARCHETYPE_PROBABILITY = 0.2;

export const LENS_NAMES: readonly LensName[] = [
  "competence_intelligence",
  "autonomy_control",
  "safety_certainty",
  "achievement_growth",
  "significance_status",
  "connection_trust",
  "approval_recognition",
  "care_contribution",
  "family_provider",
  "novelty_opportunity",
  "efficiency_simplicity",
  "legacy_durability",
];

/** The evidenceToLookFor phrases from src/content/lenses.ts, as customer-speech patterns. */
const ARCHETYPE_RULES: readonly { name: LensName; pattern: RegExp }[] = [
  { name: "competence_intelligence", pattern: /\b(mechanism|assumptions?|how (does|do|would) (it|this|that) (actually |really )?work|how exactly|what'?s the logic|under the hood|limitations?|trade-?offs?|send (me|us) the numbers|show (me|us) the (data|numbers|results))\b/i },
  { name: "autonomy_control", pattern: /\b(options?|my call|my decision|i decide|i'?ll decide|up to me|reversible|on my terms|i choose|final say)\b/i },
  { name: "safety_certainty", pattern: /\b(risks?|guarantee|what (if|happens if|happens when) (it|this|that) (breaks|fails|stops|goes down)|goes? wrong|fallback|what'?s the support|get out of|cancel|locked in|ambushed|burned)\b/i },
  { name: "achievement_growth", pattern: /\b(grow|growth|targets?|goals?|hit (our|the|my) number|more (leads|sales|units|appointments|deals)|double|expand|expanding|second (store|rooftop))\b/i },
  { name: "significance_status", pattern: /\b(stand out|different from (the|every|other)|differentiate|look (good|professional|sharp)|reputation|the best (in|store|dealer)|top store|nobody else (does|has))\b/i },
  { name: "connection_trust", pattern: /\b(who do i (talk|speak) to|same person|point of contact|someone i can call|know who (i'?m|we'?re) (talking|dealing) with|continuity|by name|one person who)\b/i },
  { name: "approval_recognition", pattern: /\b(is that a good idea|am i (right|crazy|wrong)|what would you do|does that sound right|reassur(e|ance)|do you think (we|i) should|would you do it)\b/i },
  { name: "care_contribution", pattern: /\b(my (team|people|guys|staff|salespeople|customers)|our (people|customers|team|staff)|for them|help (them|the team|my people)|easier on (them|the floor))\b/i },
  { name: "family_provider", pattern: /\b(my (kids|wife|husband|family|son|daughter)|family business|family-?owned|the kids|for my family)\b/i },
  { name: "novelty_opportunity", pattern: /\b(latest|newest|cutting[- ]edge|what else can it do|new (capabilit(y|ies)|features?|possibilit(y|ies))|possibilities|what'?s next|the new thing)\b/i },
  { name: "efficiency_simplicity", pattern: /\b(fewer steps|simple|simpler|less work|nothing to log|don'?t have to log|doesn'?t have to log|keep it (tight|short|quick|brief)|too many (steps|tools|screens|logins)|short version)\b/i },
  { name: "legacy_durability", pattern: /\b(long[- ]term|build something|lasting|for years|hand (it )?(down|off) to|outlast|next generation|sell the (store|business) one day|still here in)\b/i },
];

/** One hit 0.45, two 0.65, three or more 0.8, before profile status. */
function probabilityForHits(hits: number): number {
  if (hits <= 0) return 0;
  if (hits === 1) return 0.45;
  if (hits === 2) return 0.65;
  return 0.8;
}
const PROFILE_STATUS_BOOST: Record<"hypothesis" | "confirmed" | "contradicted", number> = { hypothesis: 0.1, confirmed: 0.15, contradicted: -0.3 };
const MAX_PROBABILITY = 0.9;

/** Top MAX_ARCHETYPE_READ by probability, then lens order; entries under MIN_ARCHETYPE_PROBABILITY are dropped. */
export function rankArchetypeRead(entries: ArchetypeRead[]): ArchetypeRead[] {
  return entries
    .filter((e) => e.probability >= MIN_ARCHETYPE_PROBABILITY && e.spans.length > 0)
    .sort((a, b) => b.probability - a.probability || LENS_NAMES.indexOf(a.name) - LENS_NAMES.indexOf(b.name))
    .slice(0, MAX_ARCHETYPE_READ);
}

/**
 * Deterministic archetype read from customer turns and the customer's explicit preferences.
 * The profile's lens status moves the probability, never establishes an entry without words.
 */
export function inferArchetypes(transcript: TranscriptSpan[], profile?: CommunicationProfile): ArchetypeRead[] {
  const customer = transcript.filter(customerSpanOk);
  const prefSpans = (profile?.explicitPreferences ?? []).map((p) => p.text).filter((t) => typeof t === "string" && t.trim().length > 0).map(preferenceSpan);
  const out: ArchetypeRead[] = [];
  for (const rule of ARCHETYPE_RULES) {
    const spans = unionSpans(customer.filter((s) => rule.pattern.test(s.text)), prefSpans.filter((s) => rule.pattern.test(s.text)));
    if (spans.length === 0) continue;
    let probability = probabilityForHits(spans.length);
    const status = profile?.lenses.find((l) => l.name === rule.name)?.status;
    if (status) probability += PROFILE_STATUS_BOOST[status];
    out.push({ name: rule.name, probability: round2(Math.max(0, Math.min(MAX_PROBABILITY, probability))), spans });
  }
  return rankArchetypeRead(out);
}

/** Evidence accumulates: max probability per lens, spans union, then ranked again. */
export function mergeArchetypeRead(prev: ArchetypeRead[], next: ArchetypeRead[]): ArchetypeRead[] {
  const byName = new Map<LensName, ArchetypeRead>();
  for (const e of [...prev, ...next]) {
    const cur = byName.get(e.name);
    if (cur) byName.set(e.name, { name: e.name, probability: Math.max(cur.probability, e.probability), spans: unionSpans(cur.spans, e.spans) });
    else byName.set(e.name, { name: e.name, probability: e.probability, spans: [...e.spans] });
  }
  return rankArchetypeRead([...byName.values()]);
}

/** Errors, empty when valid: known lens, probability in range and at least the minimum, customer spans, at most four, sorted. */
export function validateArchetypeRead(read: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(read)) return ["archetypeRead must be an array"];
  if (read.length > MAX_ARCHETYPE_READ) errors.push(`archetypeRead has more than ${MAX_ARCHETYPE_READ} entries`);
  let last = Infinity;
  read.forEach((e, i) => {
    const r = e as Partial<ArchetypeRead> | undefined;
    if (!r || typeof r !== "object") { errors.push(`archetypeRead[${i}] is not an object`); return; }
    if (!LENS_NAMES.includes(r.name as LensName)) errors.push(`archetypeRead[${i}] names an unknown lens`);
    if (typeof r.probability !== "number" || !Number.isFinite(r.probability) || r.probability < 0 || r.probability > 1) errors.push(`archetypeRead[${i}] probability must be a number from 0 to 1`);
    else {
      if (r.probability < MIN_ARCHETYPE_PROBABILITY) errors.push(`archetypeRead[${i}] probability under ${MIN_ARCHETYPE_PROBABILITY} is not a read`);
      if (r.probability > last) errors.push("archetypeRead must be sorted by probability, highest first");
      last = r.probability;
    }
    if (!Array.isArray(r.spans) || r.spans.length === 0) errors.push(`archetypeRead[${i}] asserted without a customer span`);
    else if (!r.spans.every(customerSpanOk)) errors.push(`archetypeRead[${i}] cites a span the customer did not speak`);
  });
  return errors;
}

// ---------- Words for the read ----------

/** What the customer values, in plain words: the hero of the brief's people section. Never the lens name. */
export const VALUE_WORD: Record<LensName, string> = {
  competence_intelligence: "Proof",
  autonomy_control: "Control",
  safety_certainty: "Certainty",
  achievement_growth: "Growth",
  significance_status: "Standing out",
  connection_trust: "A known contact",
  approval_recognition: "Reassurance",
  care_contribution: "Their people",
  family_provider: "Their family",
  novelty_opportunity: "What's new",
  efficiency_simplicity: "Simplicity",
  legacy_durability: "Something lasting",
};

export type ConfidenceWord = "High" | "Medium" | "Low";

/** High at 0.7 and above, Medium at 0.4 and above, Low below. */
export function confidenceWordFor(probability: number): ConfidenceWord {
  if (probability >= 0.7) return "High";
  if (probability >= 0.4) return "Medium";
  return "Low";
}
