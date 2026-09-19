/**
 * The Impact Formula as structured lens data. Source: docs/sources/apohenia/Impact_Framework.md
 * (a source study of two instructor transcripts, written for a different business; the method
 * transfers, the offer examples do not).
 *
 * What this file is: the four phases mapped to our four stage scores, the terminology, the entry
 * routes, the decision-history tree, the commitment sequence, the pitch structure, the objection
 * tree, the delivery cues, the three source taxonomies, and every "do not" the source study states.
 *
 * What this file is not: a script. Coercive branches carry `studyOnly: true` and never enter a
 * live prompt. Missing source scripts are marked missing, not reconstructed. Pure data.
 */

export type OurStage = "contacted" | "qualified" | "buying" | "bought";

export type PhaseId = "intent" | "logicalCertainty" | "emotionalCertainty" | "pitch";

export interface Phase {
  id: PhaseId;
  name: string;
  goal: string;
  /** What the instructor wants each question in the phase to obtain. */
  answerObjectives: string[];
  /** What a transcript must contain for the phase to count as done. Each line is checkable against spans. */
  requiredEvidence: string[];
  /** Our funnel stage whose score this phase informs (D: "The transcript decides"). */
  ourStage: OurStage;
  /** Bank ids (see questionBank.ts) that belong to the phase. */
  bankIds: string[];
}

export const PHASES: readonly Phase[] = [
  {
    id: "intent",
    name: "Intent",
    goal: "Confirm the person and the real lead context, then get one tangible (a desired future result) and the experience behind it (the present problem that makes the gap real).",
    answerObjectives: [
      "Confirm the intended person and the documented action that created the lead.",
      "Select one intent opener: new-activity intent or improvement-specific intent, never both.",
      "Elicit the tangible: a goal in the future, stated in the prospect's words.",
      "Elicit the experience: what they have seen that makes them feel they are not achieving it.",
      "When experience produces another generic goal, mirror: what would the goal let them do that they cannot do now.",
    ],
    requiredEvidence: [
      "A two-way exchange with the customer (the customer spoke, not only the rep).",
      "The lead context named and confirmed by the customer, or the customer stating why they are on the call.",
      "One tangible in the customer's words, cited as a span.",
      "One experience or present problem in the customer's words, distinct from a restatement of the goal.",
      "Missing any of these is 'unknown', not a failed phase: 'I do not have that problem' is an answer.",
    ],
    ourStage: "contacted",
    bankIds: ["I01", "I02", "I03", "I04", "I05", "I06", "I07", "I08", "M02", "M04", "M05", "V01", "V02", "V03"],
  },
  {
    id: "logicalCertainty",
    name: "Logical Certainty",
    goal: "Understand the current process, what the prospect values in it, the specific problem, its duration, and its downstream impact, so the fit facts rest on what the customer said.",
    answerObjectives: [
      "Current process: what they do now to reach the tangible.",
      "Process duration and origin: how long, and what caused them to choose it.",
      "Satisfaction and valued elements: what they like, accepting that there may be nothing.",
      "Specific problem: what they would change about the process or its results.",
      "Definition of the problem: what they mean, with an example.",
      "Problem duration, distinct from process duration.",
      "Impact: an operational, economic, or personal downstream effect, in their words.",
    ],
    requiredEvidence: [
      "The current process described by the customer, cited.",
      "A specific problem in the customer's words, not a label supplied by the rep.",
      "At least one impact statement (operational, economic, or personal) cited as a span; impact is not emotional intensity.",
      "Any quantity (volume, conversion, cost) marked as a customer estimate unless verified elsewhere.",
      "Fit facts derived from these spans use FitValue: yes, no, partial, unknown. Unknown is always allowed.",
    ],
    ourStage: "qualified",
    bankIds: ["L01", "L02", "L03", "L04", "L05", "L07", "L08", "L09", "L10", "L11", "L12", "L13", "L14", "S01", "S02", "S03", "S04", "S05", "V04", "V05", "V06", "V07", "V08", "V09", "V10", "V11", "V12", "V13", "V14", "V15", "V16", "V17", "V18", "V19", "V20", "V21"],
  },
  {
    id: "emotionalCertainty",
    name: "Emotional Certainty",
    goal: "First half: why they seek help now and what their decision history predicts. Second half: what would tangibly change if the problem were solved, what that means to them in their own words, and what happens if the trajectory persists. Then the commitment sequence.",
    answerObjectives: [
      "Rationale: why seek advanced help rather than continue alone or double down.",
      "Decision history: looked before, moved forward, result, barrier, what shifted, ideal criteria.",
      "Positive future: two or three specific outcomes, each made concrete (situation, place, people, amount, time frame).",
      "Personal meaning: the customer's own term, clarified rather than swapped for a synonym; a seller-proposed label counts only when the customer confirms it, and its origin is recorded.",
      "Consequence: what happens if the current trajectory persists, as an accurate comparison of options, never a distress target.",
      "Commitment: unwilling to settle, why change now, whose responsibility (skip the responsibility question where it does not fit).",
    ],
    requiredEvidence: [
      "A reason for seeking help now in the customer's words, cited.",
      "At least one decision-history fact: prior search, prior purchase, prior result, prior barrier, or what shifted.",
      "At least one specific positive outcome the customer described, cited.",
      "At least one stated consequence of not changing, cited, recorded as the customer's comparison, not scored for distress.",
      "A concrete next step the customer committed to (a booking, a proposal review, a decision date), cited; a stated 'yes, put a plan together' counts as buying evidence.",
      "Ideal criteria recorded when the customer stated them; only deliverable, approved matches may feed the pitch.",
    ],
    ourStage: "buying",
    bankIds: ["E01", "E02", "E03", "E04", "E05", "E06", "E07", "E08", "F01", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10", "F11", "F12", "C01", "C02", "C03", "C04", "C05", "P01", "P02", "P03", "M03", "V22", "V23", "V24", "V25", "V26", "V27", "V28", "V29", "V30", "V31", "V32", "V33", "V34", "V35", "V36", "V37", "V38", "V39", "V40", "V41", "V42", "V43", "V44", "V45", "V46", "V47", "V48"],
  },
  {
    id: "pitch",
    name: "Pitch",
    goal: "With permission, present three pillars each tied to a stated problem, check relevance, ask perceived fit and the most helpful part, quote the real price, and ask how to proceed. Objections branch from here; the no-sale exit is always available.",
    answerObjectives: [
      "Permission to present a game plan.",
      "Per pillar: name it, connect it to their stated problem, explain delivery, check relevance or understanding.",
      "Perceived fit and why; the most helpful part; sometimes what that part means personally.",
      "The real, approved price, then how they would like to proceed.",
      "Objection handling: diagnose the actual constraint (budget, time, authority, fit) as independent blockers.",
    ],
    requiredEvidence: [
      "The customer explicitly agreed to pay, or to a specific signing or payment step, cited as a span. Only this counts for bought.",
      "The price the customer heard, quoted as data if the transcript mentions it; the model never establishes or negotiates money.",
      "Any objection stated by the customer, cited, with whether the customer said it was resolved.",
      "A clear no is recorded as a no with the stated reason; a no-sale exit is a valid outcome, not a failure to persist.",
      "Payment, consent, and attendance facts come only from the ledger and providers, never from the transcript.",
    ],
    ourStage: "bought",
    bankIds: ["P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12", "O01", "O02", "O03", "O04", "O06", "O07", "O08", "O12", "O13", "O22", "O25", "O26", "O30"],
  },
];

export const phaseById = Object.fromEntries(PHASES.map((p) => [p.id, p])) as Record<PhaseId, Phase>;

// ---------- Terminology ----------

export interface Term {
  term: string;
  meaning: string;
  /** The distinction the build must keep, from the source study's terminology table. */
  buildDistinction: string;
}

export const TERMS: readonly Term[] = [
  { term: "Tangible", meaning: "A desired future result or overarching goal. Later, concrete future outcomes are also called tangibles.", buildDistinction: "Store the initial goal separately from later, detailed future scenes." },
  { term: "Experience / past experience", meaning: "A past or present problem underlying the goal.", buildDistinction: "A second statement of the same goal is not automatically an experience." },
  { term: "Current process / strategy / regime", meaning: "How the prospect currently tries to achieve the goal.", buildDistinction: "Record what is known; a causal link to the problem is not established by proximity in conversation." },
  { term: "Gap", meaning: "Difference between present circumstances and the desired result.", buildDistinction: "Distinguish verified quantities, prospect estimates, hypotheses and aspirations." },
  { term: "Probe", meaning: "A question that clarifies or expands a preceding answer.", buildDistinction: "Preserve the exact term being clarified." },
  { term: "Impact", meaning: "A downstream effect of the problem.", buildDistinction: "Can be operational, economic or personal; it is not synonymous with emotional intensity." },
  { term: "Rationale", meaning: "Why seek advanced help instead of continuing alone or with the current approach.", buildDistinction: "The instructor frames it as prehandling DIY." },
  { term: "What prevented / what shifted", meaning: "Prior barrier and what changed now.", buildDistinction: "Do not treat a stated shift as permanent removal of a real constraint." },
  { term: "Ideal criteria", meaning: "What the prospect needs to see in a new solution.", buildDistinction: "Feed only deliverable, approved matches into the pitch." },
  { term: "Mirror question", meaning: "Restate the answer objective with a different question after noting the mismatch.", buildDistinction: "Not merely repeating the prospect's last three words." },
  { term: "Consequence / cost of inaction", meaning: "Imagined future if the problem remains or the desired outcome is not reached.", buildDistinction: "ASR sometimes says 'cost of an action'; the normalized term is editorial." },
  { term: "Pillar", meaning: "A component or step of the offer tied to the customer's problem and desired result.", buildDistinction: "A pillar name is not proof of a deliverable or an outcome." },
  { term: "Agreeance statement", meaning: "Broad agreement intended to reframe an objection into certainty or perspective.", buildDistinction: "A source term, not an established fact that every objection is fear." },
  { term: "Success point", meaning: "A point in the client journey where the client experiences progress and confidence.", buildDistinction: "Milestones in the examples are not universal calendar rules." },
  { term: "UVP", meaning: "Unique value proposition of a higher-tier offer.", buildDistinction: "More, better or more efficient, or more likely to achieve the new result. No 'more likely' claim without a basis." },
];

// ---------- Entry routes and role boundaries ----------

export type EntryRouteId = "warmSetter" | "directBookedCloser" | "closerWithNotes" | "coldOutbound" | "upsell";

export interface EntryRoute {
  id: EntryRouteId;
  name: string;
  startsFrom: string;
  steps: string[];
  /** True where the route is an Apohenia addition rather than verbatim source training. */
  apoheniaAddition: boolean;
  sourceRef: string;
}

export const ENTRY_ROUTES: readonly EntryRoute[] = [
  {
    id: "warmSetter",
    name: "Warm setter",
    startsFrom: "A genuine lead action: an ad opt-in, a downloaded or purchased resource, webinar attendance, an incomplete booking, or a requested contact.",
    steps: ["Confirm identity and the actual action.", "Ask intent and experience.", "Complete logical certainty.", "Assess next-step relevance; schedule or nurture."],
    apoheniaAddition: false,
    sourceRef: "A01-A03; B02",
  },
  {
    id: "directBookedCloser",
    name: "Direct booked closer without complete discovery",
    startsFrom: "A booked call with no setter notes.",
    steps: ["Ask one appropriate opener: new-activity intent or improvement-specific intent, not both.", "Continue through experience, logical certainty, emotional certainty and pitch."],
    apoheniaAddition: false,
    sourceRef: "A04",
  },
  {
    id: "closerWithNotes",
    name: "Closer with completed setter discovery",
    startsFrom: "A handoff with setter notes.",
    steps: ["Recap the setter's notes and obtain confirmation.", "Begin emotional certainty.", "Evidence check (addition): missing or disputed notes route to the missing question, not past discovery."],
    apoheniaAddition: false,
    sourceRef: "A04; evidence check is an Apohenia addition",
  },
  {
    id: "coldOutbound",
    name: "True cold outbound",
    startsFrom: "No prior interest. The source's fully explained opening presumes prior interest and supplies no complete permission-first cold script.",
    steps: ["Cold opening with permission.", "Gatekeeper route.", "A relevant reason for contact.", "An opt-out route.", "A short-meeting alternative."],
    apoheniaAddition: true,
    sourceRef: "Source discusses outbound activity only; these steps are Apohenia additions, not source training",
  },
  {
    id: "upsell",
    name: "Upsell",
    startsFrom: "An existing client at a success point.",
    steps: ["Review delivered results and genuine positives.", "Establish the new goal and the remaining problem.", "Never replay the original problem as if delivered results did not happen."],
    apoheniaAddition: false,
    sourceRef: "B20-B21",
  },
];

// ---------- Setter transition ----------

export interface SetterTransition {
  steps: string[];
  conditionalSpendQuestion: string;
  nurtureFirstAlternative: string[];
  cautions: string[];
  bankIds: string[];
}

export const SETTER_TRANSITION: SetterTransition = {
  steps: ["Ask a six-month target for the relevant metric.", "Ask the current position, which gives the gap.", "Sometimes ask willingness to invest.", "Ask permission to connect to a closer who can investigate more deeply."],
  conditionalSpendQuestion: "In A03 the willingness-to-invest question is conditional on an answer that looks unqualified; B02 asks it more broadly. Neither a target nor theoretical willingness establishes affordability.",
  nurtureFirstAlternative: [
    "When the person barely knows the company, send a specifically relevant resource.",
    "Agree on a reconnection in roughly two or three days.",
    "On reconnection ask whether they remain interested, whether they reviewed it, what they took away and how it applies.",
    "Label testimonial material accurately and offer rescheduling without guilt.",
  ],
  cautions: ["Do not hardcode a universal affordability test.", "Neither a target income nor stated willingness establishes actual affordability."],
  bankIds: ["S01", "S02", "S03", "S04", "S05", "U01", "U02", "U03", "U04", "U05"],
};

// ---------- Decision history tree (A05) ----------

export interface DecisionNode {
  /** The question objective at this node. */
  question: string;
  bankId?: string;
  /** Branches keyed by the customer's answer. A leaf has no branches. */
  branches?: Record<string, DecisionNode>;
  /** What the branch records when it ends. */
  records?: string;
  /** True for branches added in production that the source does not diagram. */
  productionAddition?: boolean;
}

const preventedThenShifted: DecisionNode = {
  question: "What prevented you?",
  bankId: "E03",
  branches: {
    answered: { question: "What shifted now?", bankId: "E04", records: "Prior barrier and what changed. A stated shift is not permanent removal of a real constraint." },
    stillConstrained: { question: "Record the constraint as it stands.", records: "Still constrained: the barrier remains. A valid end state.", productionAddition: true },
    declined: { question: "Move on without pressing.", records: "Declined to answer. A valid end state.", productionAddition: true },
  },
};

export const DECISION_HISTORY_TREE: DecisionNode = {
  question: "Were you looking for other solutions before we spoke?",
  bankId: "E02",
  branches: {
    no: preventedThenShifted,
    yes: {
      question: "Did you move forward with anything?",
      bankId: "E05",
      branches: {
        no: preventedThenShifted,
        yes: {
          question: "What result did you get?",
          bankId: "E06",
          branches: {
            bad: { question: "What would you need to see this time?", bankId: "E07", records: "Ideal criteria. Only deliverable, approved matches feed the pitch." },
            good: { question: "Why seek something else now?", bankId: "E08", records: "Remaining bottleneck." },
            mixed: { question: "What worked and what did not?", records: "Mixed result: keep both halves.", productionAddition: true },
            ongoingProvider: { question: "What does the current provider cover, and what is missing?", records: "Ongoing provider: independent fit and authority questions remain.", productionAddition: true },
            unknown: { question: "Record as unknown.", records: "Unknown result. Unknown is always allowed.", productionAddition: true },
          },
        },
      },
    },
    noPriorNeed: { question: "Record that the need is new.", records: "Genuinely no prior need. Not an objection to prehandle.", productionAddition: true },
    notAuthorized: { question: "Who decides, and what do they need to see?", records: "Not authorized: a real stakeholder, not fear.", productionAddition: true },
  },
};

export const DECISION_HISTORY_NOTES: readonly string[] = [
  "The source objective is to discover the reason likely to return as an objection. A plausible reason for timing is accepted; the closer moves to ideal criteria rather than insisting on a different reason (A13).",
  "Prior answers can change. A buyer retains the right to revise a decision.",
  "Personal action and investment count in the source (B03); consuming free content does not. Record the distinction, do not judge the person for it.",
];

// ---------- Commitment sequence and pitch ----------

export interface CommitmentStep {
  order: number;
  objective: string;
  bankId: string;
  optional?: string;
}

export const COMMITMENT_SEQUENCE: readonly CommitmentStep[] = [
  { order: 1, objective: "Unwillingness to settle for the stated consequence.", bankId: "P01" },
  { order: 2, objective: "Why change now rather than later.", bankId: "P02" },
  { order: 3, objective: "Whose responsibility it is to make the change.", bankId: "P03", optional: "B03 notes this may be inappropriate for some individual business owners. Skip it where it does not fit." },
  { order: 4, objective: "Permission to put together a game plan.", bankId: "P04" },
];

export interface PillarStep {
  order: number;
  step: string;
}

export interface PitchVariant {
  id: "priceAfterPillars" | "priceFirst";
  name: string;
  order: string[];
  sourceRef: string;
}

export interface PitchStructure {
  perPillar: PillarStep[];
  afterPillars: string[];
  pillarNaming: string;
  exampleNamesAreNotOurOffer: string;
  variants: PitchVariant[];
  lockRule: string;
  durationNote: string;
}

export const PITCH_STRUCTURE: PitchStructure = {
  perPillar: [
    { order: 1, step: "Name the pillar." },
    { order: 2, step: "Connect it to the problem the customer stated earlier, in their words." },
    { order: 3, step: "Explain the relevant delivery or solution." },
    { order: 4, step: "Check relevance or understanding." },
  ],
  afterPillars: ["Ask perceived fit.", "Ask why.", "Ask the most helpful part.", "Sometimes ask what that part means personally.", "Quote the real, approved price.", "Ask how they would like to proceed."],
  pillarNaming: "Comprehensible, result-oriented pillar names rather than jargon (B04).",
  exampleNamesAreNotOurOffer: "The source examples (portal/structure, coaching/accountability, ongoing support) are features of the example course, not our offer.",
  variants: [
    { id: "priceAfterPillars", name: "Price after pillars", order: ["permission", "pillar 1", "pillar 2", "pillar 3", "fit and why", "most helpful part", "price", "how to proceed"], sourceRef: "A07" },
    { id: "priceFirst", name: "Price first", order: ["permission", "price", "pillar 1", "pillar 2", "pillar 3", "fit and why", "most helpful part", "how to proceed"], sourceRef: "B04 (instructor's stated preference)" },
  ],
  lockRule: "Lock one approved variant during a practice cohort; do not silently alternate while a rep is memorizing.",
  durationNote: "The three-to-five-minute guidance is a teaching heuristic, not a reason to omit scope, costs, limitations or terms. The buyer's comprehension matters more than a stopwatch.",
};

// ---------- Objection tree ----------

export interface ObjectionStep {
  objective: string;
  bankId?: string;
  /** Coercive in the source. Kept for study; never enters a live prompt or hint. */
  studyOnly?: boolean;
  note?: string;
}

export interface ObjectionBranch {
  id: "moneyLogistics" | "time" | "partner" | "fear";
  name: string;
  /** True when the whole branch is study-only in this build. */
  studyOnly: boolean;
  steps: ObjectionStep[];
  sourceInterpretation?: string;
  commercialAdaptation: string;
  sourceRef: string;
}

export interface FearFrame {
  name: string;
  status: "worked" | "named_or_partial";
  sourceRef: string;
  studyOnly: true;
}

export interface ObjectionTree {
  rule: string;
  branches: ObjectionBranch[];
  fearFrames: FearFrame[];
  missingMaterial: string;
  exit: {
    name: string;
    steps: string[];
    sourceExitWhatWeDoNotDo: string;
  };
}

export const OBJECTION_TREE: ObjectionTree = {
  rule: "The source always starts with money logistics regardless of the first objection, then branches on the renewed decision request: buy, time or partner logistics, or fear. Production diagnoses the actual constraint first and keeps budget, time, authority and fit as independent blockers.",
  branches: [
    {
      id: "moneyLogistics",
      name: "Money logistics",
      studyOnly: false,
      steps: [
        { objective: "Isolate value with a hypothetical gift of the full price.", bankId: "O01" },
        { objective: "Ask why, and the personal impact of the valued component.", bankId: "O02" },
        { objective: "Ask what the valued component would do for them personally.", bankId: "O03" },
        { objective: "Ask whether the upfront amount or the timing is the constraint.", bankId: "O04" },
        { objective: "Ask available savings to shape a plan.", bankId: "O05", studyOnly: true, note: "Replaced in production by the customer's stated business budget; never a savings interrogation." },
        { objective: "Check whether a specific approved plan fits their stated budget.", bankId: "O06", note: "Plans and prices come from the approved offer; the model never invents one." },
        { objective: "Ask how they would like to proceed.", bankId: "O07" },
      ],
      commercialAdaptation: "Explain approved proof and alternatives; stage the commitment so risk is manageable. A no remains available.",
      sourceRef: "O01-O07; A11; B05",
    },
    {
      id: "time",
      name: "Time",
      studyOnly: false,
      steps: [
        { objective: "Isolate value without the time constraint.", bankId: "O08" },
        { objective: "Two-person analogy: same responsibilities used as excuse versus reason.", studyOnly: true },
        { objective: "Ask which identity they choose and why.", bankId: "O09", studyOnly: true },
        { objective: "Push back: you do not have to be that person.", bankId: "O10", studyOnly: true },
        { objective: "Consequence of the first choice.", bankId: "O11", studyOnly: true },
        { objective: "Commitment: what decision puts you in the best position to reach the goal?", bankId: "O12" },
      ],
      commercialAdaptation: "Treat time as a real constraint: ask what would have to be true for implementation to fit, and offer a bounded next step or a later date.",
      sourceRef: "O08-O12",
    },
    {
      id: "partner",
      name: "Partner",
      studyOnly: false,
      steps: [
        { objective: "Isolate value with imagined partner approval.", bankId: "O13" },
        { objective: "What if the partner declines: do it anyway or give up?", bankId: "O14", studyOnly: true, note: "False binary. Not an approved commercial question." },
        { objective: "Why would you do it anyway?", bankId: "O15", studyOnly: true },
        { objective: "Crown and responsibility analogy.", bankId: "O16", studyOnly: true },
        { objective: "Who does the work, whose responsibility, is delegation fair, why.", bankId: "O17", studyOnly: true },
        { objective: "Responsibility conclusion and defense.", bankId: "O18", studyOnly: true },
        { objective: "Would it be fair to put that on anyone else?", bankId: "O19", studyOnly: true },
        { objective: "Why would that not be fair?", bankId: "O20", studyOnly: true },
        { objective: "Career consequence.", bankId: "O21", studyOnly: true },
        { objective: "Commitment and action.", bankId: "O12" },
      ],
      sourceInterpretation: "The source treats continued partner consultation after a responsibility agreement as fear. That is the instructor's interpretation, not proof of signing authority or joint-funds permission.",
      commercialAdaptation: "Treat a partner as a real stakeholder: record them, ask what they need to see, and offer to include them. Authority is an independent blocker.",
      sourceRef: "O13-O21",
    },
    {
      id: "fear",
      name: "Fear",
      studyOnly: false,
      steps: [
        { objective: "Agreeance statement: reframe the concern as seeking certainty, or into perspective.", bankId: "O22", note: "A source term, not proof that every objection is fear." },
        { objective: "Frame.", bankId: "O23", studyOnly: true, note: "Worked analogies: worker versus entrepreneur (A11), beach without perfect weather (B05)." },
        { objective: "Pushback.", bankId: "O25", note: "Can you see how deciding by seeking certainty contributed to the current situation?" },
        { objective: "Consequence.", bankId: "O26" },
        { objective: "CTA: identity, mindset or buying.", bankId: "O31", note: "The mindset CTA is private_training in the bank; the buying CTA is the decision question." },
      ],
      commercialAdaptation: "Name the specific uncertainty, answer it with approved proof and real limits, and stage the commitment. Do not turn every no into fear.",
      sourceRef: "O22-O31",
    },
  ],
  fearFrames: [
    { name: "Worker with stable pay versus entrepreneur uncertainty", status: "worked", sourceRef: "A11", studyOnly: true },
    { name: "Going to the beach without perfect weather certainty", status: "worked", sourceRef: "B05", studyOnly: true },
    { name: "Island", status: "named_or_partial", sourceRef: "A names it; B has fragments", studyOnly: true },
    { name: "What's riskier", status: "named_or_partial", sourceRef: "A", studyOnly: true },
    { name: "Fat person", status: "named_or_partial", sourceRef: "A", studyOnly: true },
    { name: "$4,000", status: "named_or_partial", sourceRef: "A", studyOnly: true },
    { name: "Runner and lion (Usain Bolt)", status: "named_or_partial", sourceRef: "A06; a future-pace setup, not one of the four fear scripts", studyOnly: true },
  ],
  missingMaterial: "The instructors refer to four fear reframes but do not spell out one complete four-frame set. Two are fully worked; the rest are named or fragmentary. They are marked incomplete, not reconstructed. Nothing is filled in from imagination and attributed to the instructors.",
  exit: {
    name: "Respectful no-sale exit",
    steps: [
      "Accept a clear refusal the first time it is clear. There is no minimum number of attempts.",
      "Restate what the customer said they would need, if they said it, and confirm it was heard.",
      "Offer only an agreed follow-up, at a date the customer chose, or none.",
      "Thank them and close the call without apology theater.",
      "Record the stated reason as data: budget, time, authority, fit, deliberate deferral, bad fit, or do-not-contact.",
    ],
    sourceExitWhatWeDoNotDo: "The source ends after four reframes with an apology suggesting the seller failed the prospect and the prospect will suffer. Production does not use that exit.",
  },
};

// ---------- Delivery cues ----------

export type DeliveryElement = "casual" | "curious" | "skeptical" | "concernEmpathy" | "pacing";

export interface DeliveryCue {
  element: DeliveryElement;
  instructor: "A" | "B";
  described: string;
  /** Always "described": these are instructor-described performance cues, not measured physiology or audio. */
  basis: "described";
}

export const DELIVERY_CUES: readonly DeliveryCue[] = [
  { element: "casual", instructor: "A", described: "Open posture, visible hands; most of the call; confident pitch.", basis: "described" },
  { element: "casual", instructor: "B", described: "Conversational familiarity, the rep's own natural vocabulary, not adopting another personality.", basis: "described" },
  { element: "curious", instructor: "A", described: "Tilt head, squint; early discovery; positive future with upward inflection.", basis: "described" },
  { element: "curious", instructor: "B", described: "Intent and logical certainty; lower guard; first-person demonstration.", basis: "described" },
  { element: "skeptical", instructor: "A", described: "Lean back, brow cue; some logical questions and what shifted.", basis: "described" },
  { element: "skeptical", instructor: "B", described: "Mainly the first half of emotional certainty; leaning out; some described examples differ.", basis: "described" },
  { element: "concernEmpathy", instructor: "A", described: "Lean toward, raised eyebrows; optional chest or heart gesture.", basis: "described" },
  { element: "concernEmpathy", instructor: "B", described: "Slow pacing; the instructor dislikes the hand-on-heart gesture for himself.", basis: "described" },
  { element: "pacing", instructor: "A", described: "Cues can accelerate or decelerate and follow the emotional direction.", basis: "described" },
  { element: "pacing", instructor: "B", described: "Generally faster early discovery, slower emotional sections; mixed pacing for reframe, pushback, consequence, CTA. B16 contains a wording inconsistency about early-phase pacing; preserved as ambiguity.", basis: "described" },
];

export const DELIVERY_NOTES: readonly string[] = [
  "Audio-only prospects cannot see gesture. A gesture may be offered as an optional practice cue; never score whether the prospect saw it.",
  "Verbal cueing: the rep chooses five acknowledgments that fit them (proposed defaults: Right, Okay, I see, That makes sense, Go on). The interjection bridge is acknowledgment, refer to what they said, next question.",
  "Delivery labels in the bank are described, not measured. The reviewed call records are marked not_audio_verified.",
];

// ---------- Three source taxonomies ----------

export interface SourceTaxonomy {
  name: string;
  categories: string[];
  intendedSourceUse: string;
  /** Always true: none of these is the owner's ego archetype system (src/content/lenses.ts). */
  notTheArchetypeSystem: true;
  productionHandling: string;
}

export const SOURCE_TAXONOMIES: readonly SourceTaxonomy[] = [
  {
    name: "Six human needs",
    categories: ["certainty", "uncertainty", "love/connection", "growth", "significance", "contribution"],
    intendedSourceUse: "Understand which motivations the instructor believes matter most; he attributes the lens to Tony Robbins.",
    notTheArchetypeSystem: true,
    productionHandling: "Study reference only. Do not invent extra members (approval, intelligence) as if they were part of the six.",
  },
  {
    name: "Alpha/beta buying pocket",
    categories: ["assertive / high-confidence", "low-confidence", "the middle 'buying pocket'"],
    intendedSourceUse: "The source recommends raising or lowering the prospect's perceived confidence or status.",
    notTheArchetypeSystem: true,
    productionHandling: "Study reference only. Status deflation (deliberately mishearing a number, an unsupported 'why so low') stays out of live coaching.",
  },
  {
    name: "Reinforced identities",
    categories: ["intelligent", "bold", "courageous", "role-specific: father, provider, employer"],
    intendedSourceUse: "Source labels to influence self-perception and commitment.",
    notTheArchetypeSystem: true,
    productionHandling: "Study reference only. Purchase is never a test of being a good parent or worthy person.",
  },
];

export const TAXONOMY_NOTE =
  "The owner's ego archetypes (src/content/lenses.ts, SOS-07) sit beside these, not inside them. In production, record user-confirmed decision preferences with quotations, uncertainty and corrections, never hidden diagnoses or permanent personality tags.";

// ---------- Source variations and gaps ----------

export interface GapRegisterEntry {
  topic: string;
  supplied: string;
  handling: string;
}

export const GAP_REGISTER: readonly GapRegisterEntry[] = [
  { topic: "Logic/emotion maxim", supplied: "A says buy on emotion, justify with logic; B repeatedly reverses it.", handling: "Preserve the inconsistency; claim no shared law." },
  { topic: "Price placement", supplied: "A after pillars; B either end, instructor prefers the beginning.", handling: "Two variants, one explicit chosen live version." },
  { topic: "Tone placement", supplied: "Differs across instructors and B modules.", handling: "Versioned delivery overlays; no invented exact audio." },
  { topic: "Prior-result branches", supplied: "A has a detailed good/bad tree; B concentrates on prevented/shifted.", handling: "Keep both mappings; merge only in labeled adaptation." },
  { topic: "Negative tangible count", supplied: "A two or three; B one or two plus a regret probe.", handling: "Preserve the variant; never require distress." },
  { topic: "Setter money screen", supplied: "Conditional in A, broad in B.", handling: "No universal affordability test." },
  { topic: "Four fear frames", supplied: "Two fully worked; others named or fragmentary.", handling: "Mark incomplete; fabricate nothing." },
  { topic: "Cold outbound", supplied: "Activity discussed; warm opener fully scripted.", handling: "Explicitly original cold permission and routing module." },
  { topic: "Ego archetype system", supplied: "Six needs, confidence styles, identity labels; not the owner's taxonomy.", handling: "Do not conflate; separately configurable." },
  { topic: "Tone, audio, video", supplied: "Untimed text and instructor commentary.", handling: "No acoustic or body evidence, no fake timestamps." },
  { topic: "Payment in reviewed call", supplied: "Narrator claims paid in full; no payment shown.", handling: "Report the claim separately from observed events." },
  { topic: "Health, psychology, earnings claims", supplied: "Training assertions and testimonials.", handling: "Retain attributed text; imply no validation." },
];

// ---------- Every do-not the source study states ----------

export const DO_NOTS: readonly string[] = [
  "Do not force a no-answer back to a positive (the forced positive). Ask what should be preserved and accept that there may be nothing the customer likes.",
  "Do not use the regret probe (the day-to-day feeling months from now, knowing you could have been X). Consequence is an accurate comparison of options, never a distress target.",
  "Do not make purchase a test of being a good parent, provider or worthy person (identity as worth).",
  "Do not deflate status: no deliberately misheard numbers, no 'why so low' without a real, relevant benchmark.",
  "Do not fill gaps in the source from imagination and attribute them to the instructors. Missing scripts stay missing.",
  "Do not score how distressed the customer was made as a success metric.",
  "Do not hardcode a universal affordability test. A target or stated willingness is not affordability.",
  "Do not manufacture a confession. 'I do not have that problem' is an answer.",
  "Do not treat every no as fear, and do not remove the no-sale exit. There is no minimum number of attempts after a clear refusal.",
  "Do not treat a stated shift as permanent removal of a real constraint.",
  "Do not treat a pillar name as proof of a deliverable or an outcome.",
  "Do not present the source's pillar examples as our offer.",
  "Do not silently alternate price placement while a rep is memorizing one variant.",
  "Do not use the three-to-five-minute pitch heuristic as a reason to omit scope, costs, limitations or terms.",
  "Do not treat partner consultation as fear; it is not proof of signing authority or joint-funds permission.",
  "Do not use the false binary 'do it anyway or give up' against a partner objection.",
  "Do not use the source's apology exit that suggests the prospect will suffer.",
  "Do not score whether the prospect saw a gesture. Delivery cues are described, not measured.",
  "Do not invent one exact rhythm where the transcript is ambiguous about pacing.",
  "Do not import the six human needs, the buying pocket or the reinforced identities as the owner's archetype system, and do not invent extra members for them.",
  "Do not record hidden diagnoses or permanent personality tags; record confirmed preferences with quotations, uncertainty and corrections.",
  "Do not use the source's status-deflation examples in live coaching.",
  "Do not use the tease for not watching a resource, and do not disguise testimonial material as training.",
  "Do not pretend to be customer support or imply credit or no extra money on an upsell.",
  "Do not charge to repair an original unfulfilled promise; a new offer must have genuine additional value.",
  "Do not claim 'more likely to achieve the result' without an adequate basis.",
  "Do not move agreed follow-up dates earlier without consent; buckets are a next expected step, not permission.",
  "Do not put referred contacts into automatic campaigns until reviewed; accept no on a referral request.",
  "Do not treat the narrator's paid-in-full claim as observed evidence or as evidence of the method's effectiveness.",
  "Do not treat the prospect's estimates of missed sales as verified revenue loss, and do not mix skill progress with income progress.",
  "Do not treat a repeated goal as an experience, or proximity in conversation as causation.",
  "Do not swap the customer's own word for a generic synonym; clarify it. A seller-proposed label counts only when confirmed, with its origin recorded.",
  "Do not use the sales pressure sequence against the rep in their own identity interview, and do not export the rep's priorities into every prospect's profile.",
  "Do not prescribe sleep deprivation, breathing routines, isolation or denial of exhaustion from the training's physiology claims. They are not validated and not health guidance.",
  "Do not claim one shared scientific law where the instructors contradict each other (buy on emotion versus logic).",
  "Do not fake timestamps or claim acoustic or body-language evidence from untimed text.",
  "Do not contrast advanced help positively with 'the average person' as if that were an objective finding.",
];

export interface ImpactFormula {
  name: "Impact Formula";
  source: "docs/sources/apohenia";
  phases: readonly Phase[];
  terms: readonly Term[];
  entryRoutes: readonly EntryRoute[];
  setterTransition: SetterTransition;
  decisionHistoryTree: DecisionNode;
  commitmentSequence: readonly CommitmentStep[];
  pitch: PitchStructure;
  objections: ObjectionTree;
  deliveryCues: readonly DeliveryCue[];
  sourceTaxonomies: readonly SourceTaxonomy[];
  gapRegister: readonly GapRegisterEntry[];
  doNots: readonly string[];
}

export const IMPACT_FORMULA: ImpactFormula = {
  name: "Impact Formula",
  source: "docs/sources/apohenia",
  phases: PHASES,
  terms: TERMS,
  entryRoutes: ENTRY_ROUTES,
  setterTransition: SETTER_TRANSITION,
  decisionHistoryTree: DECISION_HISTORY_TREE,
  commitmentSequence: COMMITMENT_SEQUENCE,
  pitch: PITCH_STRUCTURE,
  objections: OBJECTION_TREE,
  deliveryCues: DELIVERY_CUES,
  sourceTaxonomies: SOURCE_TAXONOMIES,
  gapRegister: GAP_REGISTER,
  doNots: DO_NOTS,
};

/** The phase that informs a given stage score. */
export function phaseForStage(stage: OurStage): Phase {
  const p = PHASES.find((x) => x.ourStage === stage);
  if (!p) throw new Error(`no phase for stage ${stage}`);
  return p;
}
