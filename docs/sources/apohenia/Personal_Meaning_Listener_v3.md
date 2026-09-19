# Apohenia — Personal Meaning Listener
## Codex addendum v3: first-mention associations, not keyword frequency

**Status:** Implementation specification based on the conversational behavior Jason approved. No application implementation or live-model performance is asserted by this document.

**Scope:** Refine the language-listening feature in the existing Apohenia sales-training and call application. Do not rebuild the entire application, change its sales methodology, or modify the source transcript archive. Use this addendum alongside the existing master brief. Where earlier vocabulary requirements imply waiting for repetition, this addendum takes precedence. Retain the existing consent, privacy, security, offer-approval, and exact-script requirements.

**Attribution:** This specification develops Jason's requested behavior and the examples he approved. The jazz, soufflé, and ambushed examples are illustrative conversations, not quotations from Andrés's training or verified customer calls. “Personal Meaning Listener” is a product name, not a psychological diagnosis or a claim of a scientifically validated assessment.

## 1. The central requirement

Build a listener that notices the specific words, analogies, images, and comparisons a prospect chooses when several other expressions could communicate the same general message. Those choices can be useful references for later communication, even when they occur only once.

The listener's operational question is:

> Of the ways this person could have expressed this idea, what distinctive expression did they voluntarily choose, what does it represent here, and when could that same reference help explain a later point?

This is NOT a keyword counter, a repeated-topic detector, generic sentiment analysis, a synonym-replacement function, or a personality classifier.

The intended loop is:

**Notice the choice → preserve the exact expression and local meaning → display it prominently → retain it across the conversation → recognize a relevant later opportunity → suggest an appropriate line or question in that frame of reference.**

A first unprompted mention is eligible immediately. Repetition can strengthen evidence; it is never an admission requirement. Recognition does not depend on the prospect explaining the personal origin of the reference.

At the same time, a reference proves what was said, not why it was selected. Do not assert that the prospect considered a specific list of alternatives, has a particular biography, or values a topic deeply without evidence. A useful analogy can be available for reuse while its personal significance remains unknown.

## 2. What to notice

Detect prospect-originated analogy domains such as hockey, jazz, cooking, gardening, construction, or chess. Also detect distinctive emotional descriptions, chosen outcome labels, repeated metaphors, explicit corrections, and personally defined terms.

Examples: “ambushed,” “boxed in,” “breathing room,” “a jazz band where everybody wants a solo,” “profit, not revenue,” and a collapsed soufflé after extensive preparation.

Preserve both the reference and the relationship. “Jazz” alone misses the coordination-versus-individuality comparison. “Soufflé” alone misses the effort-followed-by-collapse comparison. An unusual word without a relevant contextual relationship is not automatically important.

Differentiate a spontaneous comparison from a prompted answer, repetition of the seller's wording, someone else's opinion, negation, sarcasm, a commonplace idiom, and a literal entity mention. A seller-proposed label that the prospect endorses may still be useful, but its origin must remain accurate.

Do not use a closed list of sports or favorite words as the detector. The examples define expected behavior, not the only phrases the application can recognize.

## 3. Keep four kinds of information separate

**Observed:** Exact quote, speaker, transcript location, and how the expression was used.

**Interpretation of this sentence:** The relationship or business point expressed by the comparison. Label it inferred until confirmed when ambiguity remains.

**Possible communication use:** A proposed later situation where the same wording or comparison would clarify a relevant point.

**Confirmed personal meaning:** Only the meaning or personal connection explicitly supplied or confirmed by the prospect. Otherwise leave this unknown.

Do not populate biography guesses, personality labels, trauma narratives, gambling behavior, or hidden motives from a sports or cooking reference. Do not display numerical certainty that someone “loves hockey” because they chose a hockey example.

Unknown personal origin does not prevent contextual reuse. Saying “Using your hockey example…” can be justified by their example alone; saying “Since you grew up playing hockey…” cannot.

## 4. Preserve contextual emotional meaning

Store what the positive or negative description attaches to, not merely a positive/negative label for the entire topic.

For “as bad as breaking your leg in basketball,” the negative object is the injury/setback, not necessarily basketball. Record the comparison without inferring that the prospect dislikes the sport or personally sustained an injury.

For the collapsed soufflé, the negative object is a disappointing result after effort, not cooking in general.

For “ambushed by extra charges,” distinguish the prospect's explicit description from the unconfirmed explanation. Ask what made it feel like an ambush when that clarification serves the business discussion.

Do not amplify distress, exploit painful personal disclosures, or make a purchase seem necessary to prove an identity. Where an analogy concerns an intensely painful event, default to a neutral acknowledgment and business-level clarification rather than creatively elaborating the painful image.

## 5. Prominent call-room behavior

Keep the exact script visible and stable. Place a dedicated **THEIR REFERENCES** area immediately beside or above it, coordinated with the existing **THEIR WORDS** feature rather than creating duplicate keyword panels.

Support 3–7 visible/pinned references by default, adjustable large labels around 24–36px on desktop, readable full phrases, zoom, keyboard controls, and expandable overflow. These are interface defaults, not limits on the conversation's reference memory. Do not shrink several reminders into illegible tags.

A collapsed card shows the large term/reference and one short meaning line. An expanded or selected card shows:

- Their exact phrase and speaker/source evidence.
- What the comparison represents in this context.
- Whether meaning is observed, inferred, confirmed, or unknown.
- When it may be useful later.
- One suggested next question or bridge, if appropriate now.

Use three simple action labels: **KEEP FOR LATER**, **USE NOW**, and **CLARIFY MEANING**. A reference can be kept for later without interrupting the call or demanding personal-history questions.

Pinning protects a card's position; it does not certify its accuracy. Provide pin, unpin, dismiss, correct, and “do not reuse this reference” controls. A correction or transcript retraction must visibly update/invalidate a pinned card. It must not silently remain available as valid coaching context.

Do not flash, automatically move the reading position, reorder pinned cards, or replace the line the salesperson is currently reading. A semantic suggestion is a separate optional overlay, not an unsolicited rewrite of the memorized script.

## 6. Delayed recall is essential

A reference detected during discovery may become useful several stages later. Persist it within the current authorized session, even when its original utterance is outside the most recent transcript window.

Retrieve references by the concept under discussion, not just matching nouns. A current concern about scripts making staff sound robotic should be able to retrieve an earlier jazz-band comparison about individuality and coordination, even when the current turn contains no music words.

Generate at most one primary suggestion at a time. Its wording should be concise, natural, grounded in the prospect's reference, appropriate to the current question's purpose, and compatible with the approved offer.

Do not force every explanation into a metaphor. Abstaining from a suggestion is a valid output. Do not repeat a metaphor immediately after it has just been used unless clarification requires it. Retain reuse history and the prospect's feedback. Stop using it when rejected.

An analogy illustrates a concept; it cannot prove a promised result. Do not generate capabilities, ownership commitments, discounts, guarantees, or contract terms merely to complete an attractive comparison. Questions about required safeguards can be suggested before those safeguards are approved; promises cannot.

## 7. Required worked examples

### A. Hockey: first mention

Prospect: “The team handles inquiries like a hockey team where nobody knows who is defending.”

Capture **HOCKEY / NOBODY KNOWS WHO IS DEFENDING** after this first utterance. Preserve the role-coordination comparison. Mark personal connection to hockey unknown. Do not wait for another mention or require a hobby interview.

Later, when responsibilities are discussed, a suitable suggestion is: “Using your hockey example, who should own the first response, and who covers it when that person is unavailable?”

Do not invent player names, team allegiance, technical hockey claims, or shared sporting experience.

### B. Jazz: preserve individuality and coordination

Prospect: “Managing these salespeople is like running a jazz band where everybody wants to play a solo.”

Capture **JAZZ BAND / EVERYBODY WANTS A SOLO**. Preserve the comparison between individual style and a lack of coordination.

Several unrelated turns later, the prospect asks: “Would a shared process make everyone sound robotic?”

A suitable suggestion is: “Going back to your jazz-band example, the idea would be to keep individual style while giving everyone the same arrangement to follow. Which parts of the follow-up need that shared structure?”

Do not infer that the prospect is a musician. Do not change the relationship into obedience, silencing staff, or dismissing the prospect's concern.

### C. Soufflé: failure after substantial effort

Prospect: “That last website project was like spending all afternoon making a soufflé and watching it collapse when it came out of the oven.”

Capture **SOUFFLÉ / COLLAPSED AFTER ALL THAT WORK**. Preserve effort followed by failure when the result should have been ready.

Later, while discussing rollout/testing, a suitable question is: “Using your soufflé comparison, what failed when the actual customers started using the website?”

After identifying the failure, suggest discussing a test of that specific situation before replacing the current workflow. Do not claim the product is guaranteed not to fail. Do not assume the prospect is a chef or personally baked the dish.

### D. Ambushed: clarify the emotionally specific term

Prospect: “I felt ambushed by the extra charges.”

Capture **AMBUSHED** rather than flattening it to “price objection.” A suitable clarification is: “When you say ‘ambushed,’ was it that the charges weren't disclosed, or that you were already committed before they appeared?” Leave room for another explanation.

Prospect later explains: “By then they had our website and we couldn't easily leave.”

Update the meaning with evidence: unexpected charges after commitment, combined with difficulty leaving. Later, retrieve it when discussing full costs, change approval, account ownership, or exit terms. Suggest reviewing those requirements, not inventing a cancellation policy.

### E. Basketball injury: do not invert or overextend the association

Prospect: “That setback was as bad as breaking your leg in basketball.”

Capture the basketball-injury comparison after one mention. Preserve its negative relationship to the setback. Do not store “basketball disliked” or an inferred injury history. Do not automatically recommend an upbeat “slam dunk” sales line from the same domain. It is valid to hold the reference without reusing the injury.

### F. Profit: distinct financial meaning

Prospect: “Revenue is fine. Profit is what matters to me.”

Capture **PROFIT** as an explicitly stated priority and preserve the distinction. Use profit-oriented language where that is the actual subject. Do not relabel revenue amounts as profit or promise improved profit without evidence. If margin definitions are necessary, ask rather than assume.

## 8. Logical data contract

Fit these fields to repository conventions rather than creating duplicate stores:

**Reference identity:** tenant ID, conversation ID, prospect speaker ID, reference ID, created/updated event versions, schema version, and extractor version.

**Evidence:** exact expression; exact supporting quote; transcript event/utterance ID; Unicode substring offsets; transcript revision; and provisional/final/corrected status. Use actual turn timestamps only when supplied. Never invent timestamps.

**Semantics:** reference kind; source domain; described business target; comparison relationship; local emotional valence and its object; origin (prospect-spontaneous, prompted, seller-introduced/prospect-confirmed, third-party, unknown); meaning status; explained meaning with its supporting evidence; and explicit prohibitions on unsupported inferences.

**Lifecycle:** first/last observed turn, occurrence count, held/pinned/dismissed/rejected/invalidated state, reason for the action, and correction history. Track evidence status independently from display/pin state.

**Reuse:** candidate purposes/stages, relevance explanation, allowed contextual mapping, proposed clarification, optional bridge text, used-at events, and reaction when explicitly available. Unknown reaction is not rejection or acceptance.

Every recommendation references valid evidence, current transcript/state versions, and the current script node/version. Preserve exact text separately from normalized labels. Do not compress an inferred interpretation into a falsely quoted customer statement.

## 9. Processing and failure behavior

Consume the existing authorized transcript pipeline; do not start a second always-on recorder or bypass consent. Apply the same listener and evidence validator to live and mock calls. The coaching side of a simulation must see only revealed utterances, never hidden scenario biography or future turns.

On each eligible transcript update: identify candidates in context, validate supporting spans and speaker ownership, upsert reference memory, evaluate current-stage relevance, and surface a concise optional recommendation.

Model output is a proposal. Reject fabricated quotes, invalid spans, unsupported speaker attribution, and stale outputs. Duplicate events must not create duplicate cards or inflate occurrence counts.

Transcript revisions must invalidate dependent interpretations and unsent suggestions before recomputation. Late model responses cannot resurrect a dismissed or rejected reference. Recent transcript context must include enough preceding conversation to detect seller priming and third-party attribution; absent context means origin is unknown, not spontaneous by default.

If coaching is unavailable, preserve the script, manual controls, and supported references already captured. Do not interrupt an otherwise working human call. Set request/token/cost limits in the existing configuration and measure latency rather than claiming an untested response speed.

Keep reference memory conversation-scoped by default. Saving a reference to a persistent prospect profile requires an explicit user action and must retain its evidence/status/date. Never turn a temporary analogy into a permanent personality trait. Apply the same access, retention, export, and deletion rules as the source conversation; keep Jason's identity profile separate.

## 10. Acceptance tests and evidence of completion

Create automated fixtures with these expectations. These are tests to implement, not claims of passing application tests:

1. First-mention hockey is recognized before any repetition.
2. First-mention jazz produces the comparison, not only the music noun.
3. Later “robotic” concern retrieves the earlier jazz reference outside the recent-turn window.
4. Soufflé's negative association attaches to collapse after effort, not cooking generally.
5. Ambushed remains an unresolved term until clarification evidence is received.
6. Basketball injury does not generate a personal injury history, team preference, gambling history, or dislike of basketball.
7. Profit remains distinct from revenue in both wording and calculations.
8. Repetition by the seller does not manufacture a prospect-originated priority.
9. “My partner follows hockey; I don't understand it” does not recommend hockey analogies for the prospect.
10. A seller-introduced analogy is labeled prompted/shared, not spontaneous.
11. “Let's touch base tomorrow” does not create a baseball-interest claim or an unnecessary sports reminder.
12. A rare noun with no relevant comparison does not automatically receive high priority.
13. A prospect rejects an analogy; later suggestions stop using it.
14. A transcript revision retracts a phrase; cards and queued suggestions update accordingly.
15. A rejected reference is not resurrected by a late model response.
16. Several references remain visible and readable beside the exact script without displacing its current line.
17. An irrelevant current topic produces no forced analogy.
18. A proposed analogy cannot introduce an unapproved offer claim or guarantee.
19. Live and simulated transcript fixtures use the same extraction/validation path; hidden mock facts are inaccessible to coaching.
20. Tenant/call boundaries, consent stopping, deletion, duplicate-event handling, and model-outage fallback work correctly.

Include paraphrased and unseen-domain cases, not only exact strings from this document. Test both successful recognition and correct abstention. Separate deterministic evidence/lifecycle tests from model-dependent quality evaluations; replaying expected fixture output is not proof of inference capability.

The end-to-end demonstration must visibly show: one occurrence → large reference card → intervening conversation → relevant later suggestion → retained source evidence. Demonstrate correction/rejection as well as success. Label prerecorded, synthetic, fixture-driven, and live-model demonstrations honestly.

## 11. Focused implementation instruction

Inspect the existing call room, script/version system, live and mock transcript flow, vocabulary UI, and tests. Extend them with this behavior using repository conventions. Do not replace the entire application or change source-study content.

Deliver one complete vertical slice for first-mention extraction, evidence-backed reference memory, prominent cards, and later contextual reuse; then expand fixture coverage and connect the existing authorized live/model interfaces. Keep functional simulation available without credentials, explicitly labeled. Do not acquire credentials, purchase services, initiate real calls, send messages, or deploy without the existing authorization process.

In the handoff, report files changed, actual checks run, observed results, model/provider verification status, unresolved failures, and any unimplemented behavior. Do not report the feature complete merely because the interface displays the word “hockey.”

**Definition of success:** The application notices a distinctive reference the prospect chose once, preserves what that reference represents, remembers it after the conversation moves on, and helps the salesperson make a relevant later point in the prospect's own frame of reference—without requiring repetition, fabricating personal history, or destabilizing the script being learned.
