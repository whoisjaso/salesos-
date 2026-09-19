# The lens: how the model reads a call

The reasoning model that scores stages, extracts facts, and writes feedback, hints and angles does so through a lens: the owner's ego archetypes (SOS-07) beside the owner's sales frameworks. This document is the breakdown of the frameworks half. Source material is in `docs/sources/apohenia/`; it was written for a different business (Apohenia), and the method transfers while the offer examples do not.

Rule from `docs/DECISIONS.md` ("The transcript decides"): every stage score above zero cites a transcript span. The lens tells the model what evidence to look for; it never lets the model invent money, consent, payment or attendance.

## Files

| File | What it is | Consumed by |
|---|---|---|
| `src/content/frameworks/impactFormula.ts` | The Impact Formula as data: four phases, terms, entry routes, setter transition, decision-history tree, commitment sequence, pitch structure, objection tree, delivery cues, three source taxonomies, gap register, every do-not | Lens pack, stage scorer, coaching UI |
| `src/content/frameworks/questionBank.ts` | All 207 source-derived question records with use class; `LIVE_QUESTIONS` is the adapt subset | Hints, drills, the phase evidence checklists |
| `src/content/frameworks/personalMeaningListener.ts` | The listener spec: `Reference` record types, six worked examples as fixtures, 20 acceptance expectations, rules | Reference extraction, THEIR REFERENCES cards, tests |
| `src/content/frameworks/index.ts` | Barrel plus `frameworkForLens()`, shaped like `SalesFramework` in `src/domain/lens.ts` | `defaultLensPack()` wiring |
| `src/content/__tests__/frameworks.test.ts` | Guards: no study-only text in live exports, counts, evidence per phase, listener fixtures | `npm test` |

## Four phases, four stage scores

The source names four phases. The setter stops after logical certainty and a transition; the closer continues. We map them onto the four stage probabilities the model emits.

| Phase | Our stage | Goal in one line |
|---|---|---|
| Intent | contacted | The person, the real lead context, one tangible, one experience |
| Logical Certainty | qualified | Current process, valued elements, specific problem, duration, impact |
| Emotional Certainty | buying | Why now, decision history, specific future, personal meaning, consequence, commitment |
| Pitch | bought | Permission, three pillars tied to stated problems, fit, approved price, decision |

`phaseForStage(stage)` and `STAGE_TO_PHASE` give the mapping in code. The bands (Yes, Likely, Unlikely, No) are owner settings and stay in the stage policy, not here.

## Evidence per stage

Each phase carries `requiredEvidence`: what the transcript must contain for the phase to count as done. The model cites spans against these lines.

| Stage | The transcript must contain |
|---|---|
| contacted | The customer spoke; the lead context confirmed or the customer stated why they are on the call; a tangible in their words; an experience distinct from a restated goal |
| qualified | The current process described by the customer; a specific problem in their words; at least one impact (operational, economic or personal); quantities marked as customer estimates; fit facts as yes, no, partial or unknown |
| buying | A reason for seeking help now; at least one decision-history fact; at least one specific positive outcome; at least one stated consequence recorded as their comparison; a concrete next step the customer committed to |
| bought | The customer explicitly agreed to pay or to a specific signing or payment step. Nothing else counts. Price is quoted as data if mentioned; payment facts come only from the ledger |

Unknown is always allowed. "I do not have that problem" is an answer, not a failed phase.

## The question bank

207 records parsed from the source bank, counted from the data (`BANK_COUNTS`), with the source's own use classes.

| Use | Count | Where it may go |
|---|---|---|
| adapt | 160 | `LIVE_QUESTIONS`: hints, angles, drills, after adaptation to the approved offer |
| study_only | 33 | `STUDY_ONLY`: reading the source method. Never a live prompt or hint |
| private_training | 14 | `PRIVATE_TRAINING`: the rep's own reflection. Never prospect-facing |

Templates are the bank's editorial normalizations, not verbatim quotes. The raw excerpts stay in the source file and are not in code. Bracketed slots are filled from the conversation, never from imagination.

## The listener

The Personal Meaning Listener notices the specific word, analogy or comparison a prospect chose when other expressions would have carried the same message. Loop: notice the choice, preserve the exact expression and local meaning, display it, retain it across the call, recognize a relevant later moment, suggest a line in that frame.

What it keeps separate: observed (exact quote, speaker, location), interpretation of this sentence (inferred until confirmed), possible later use, and confirmed personal meaning (only what the prospect supplied).

What it never infers: biography, hobbies, injury history, gambling, trauma, hidden motives, or a numeric certainty that someone loves a sport. "Using your hockey example" is justified by the example alone; "since you grew up playing hockey" never is. A seller-proposed label the prospect endorses is `seller_introduced_confirmed`; without enough preceding context the origin is `unknown`, never spontaneous by default. Abstaining is valid. A rejected reference stays rejected.

The six worked examples (hockey, jazz, soufflé, ambushed, basketball, profit) are fixtures with the expected capture and expected later suggestion, and the 20 acceptance expectations are typed with a deterministic or model-quality test kind.

## What stays study-only and why

| Material | Why it stays out of live prompts |
|---|---|
| Forced positive (L06) | Forces a no back to a yes to appear unbiased. We ask what should be preserved and accept nothing |
| Regret probe (C06) | Aims at distress. We record consequence as the customer's comparison of options |
| Identity as worth (D03, D04, D05) | Makes purchase a test of being a good parent or person |
| Status deflation (D01, D02) | Deliberately mishears a number or challenges without a benchmark |
| Time and partner identity pressure (O09 to O11, O14 to O21) | Identity choice, false binary, crown analogy, delegation fairness. A partner is a stakeholder, not fear |
| Fear frames (O23, O24, O27 to O29) | Worked analogies kept for study; the remaining frames are named or fragmentary and are marked missing, not reconstructed |
| Savings interrogation (O05), funds follow-up (U08) | Replaced by the customer's stated business budget and agreed constraints |
| Tease for not watching (U06), referral pressure (R04), upsell analogies (X07, X08) | Pressure moves the source recommends that we do not use |
| Physiology, sleep, isolation claims (B22 to B25) | Not validated, not health guidance; not in code at all |

The source's apology exit is replaced by a respectful no-sale exit with no minimum number of attempts.

## Ego archetypes beside the source taxonomies, not inside them

The source uses three taxonomies: the six human needs, the alpha/beta buying pocket, and reinforced identities. They are in `SOURCE_TAXONOMIES` with `notTheArchetypeSystem: true`. The owner's twelve ego archetypes (`src/content/lenses.ts`) are a separate, configurable coaching taxonomy: hypotheses that a real exchange must confirm, evidenced by the customer's own words. Approval and intelligence are archetypes; they are not extra members of the six needs. Status deflation and identity labels stay in study. In production the model records confirmed preferences with quotations, uncertainty and corrections, never hidden diagnoses or permanent tags.

## Where each piece lives

| Piece | Export | File |
|---|---|---|
| Four phases with evidence | `PHASES`, `phaseForStage` | impactFormula.ts |
| Terminology | `TERMS` | impactFormula.ts |
| Entry routes (cold outbound flagged as addition) | `ENTRY_ROUTES` | impactFormula.ts |
| Setter transition and nurture-first | `SETTER_TRANSITION` | impactFormula.ts |
| Decision-history tree with labeled additions | `DECISION_HISTORY_TREE` | impactFormula.ts |
| Commitment sequence | `COMMITMENT_SEQUENCE` | impactFormula.ts |
| Pitch with two price placements | `PITCH_STRUCTURE` | impactFormula.ts |
| Objection tree with study-only steps and the exit | `OBJECTION_TREE` | impactFormula.ts |
| Delivery cues, described not measured | `DELIVERY_CUES`, `DELIVERY_NOTES` | impactFormula.ts |
| Three source taxonomies | `SOURCE_TAXONOMIES`, `TAXONOMY_NOTE` | impactFormula.ts |
| Gap register | `GAP_REGISTER` | impactFormula.ts |
| Every do-not | `DO_NOTS` | impactFormula.ts |
| Question records and counts | `QUESTION_BANK`, `LIVE_QUESTIONS`, `STUDY_ONLY`, `PRIVATE_TRAINING`, `BANK_COUNTS`, `byPhase` | questionBank.ts |
| Reference record types | `Reference`, `Origin`, `MeaningStatus`, `ReferenceKind` | personalMeaningListener.ts |
| Listener fixtures, expectations, rules | `LISTENER_EXAMPLES`, `ACCEPTANCE_EXPECTATIONS`, `LISTENER_RULES` | personalMeaningListener.ts |
| Lens pack entries | `frameworkForLens()`, `IMPACT_FORMULA_PRINCIPLES` | index.ts |

## Deliberately left out

- The raw source excerpts and character offsets beyond the `sourceRef` string. They remain in the source file.
- The health, sleep, physiology and isolation claims (B22 to B25). Not validated; not in code.
- The source's revenue-share and conversion targets. Examples, not a benchmark dataset.
- The follow-up bucket calendar (1/2/4/6/8 weeks) and referral dates (day 1/10/35/60/75). Course prescriptions, not our cadence policy.
- Any reconstruction of the missing fear frames. Marked as named or partial, nothing invented.
- The narrator's paid-in-full claim on the reviewed call. Not observed in the transcript; not evidence.
