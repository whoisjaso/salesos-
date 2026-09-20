# Sales OS system map

Ten pictures. Every box names the code that owns it. One rule under all of them: nothing moves without evidence.

Companion page: the same ten sections as a phone-first HTML artifact (published by the coordinator).

## 1. The one loop

The same opportunity goes around once. Source to cash. One module owns each step.

```mermaid
flowchart LR
  R[Receive<br/>intake.ts] --> A[Assign<br/>routing.ts]
  A --> C[Act<br/>dialer.ts]
  C --> V[Verify<br/>events.ts + callIntelligence.ts]
  V --> G[Guide<br/>coaching.ts]
  G --> M[Measure<br/>metrics.ts]
  M --> I[Improve<br/>game.ts]
  I --> R
```

Modules: [`src/domain/intake.ts`](../src/domain/intake.ts), [`src/domain/routing.ts`](../src/domain/routing.ts), [`src/domain/dialer.ts`](../src/domain/dialer.ts), [`src/domain/events.ts`](../src/domain/events.ts), [`src/domain/callIntelligence.ts`](../src/domain/callIntelligence.ts), [`src/domain/coaching.ts`](../src/domain/coaching.ts), [`src/domain/metrics.ts`](../src/domain/metrics.ts), [`src/domain/game.ts`](../src/domain/game.ts).

## 2. Who sees what

You sign in as who you are. That decides the whole world. Three tabs per role, no role switcher. No lane crosses.

```mermaid
flowchart TB
  S[Session role decides<br/>session.tsx, navFor in nav.ts]
  S --> Setter
  S --> Closer
  S --> Owner
  subgraph Setter
    s1[Today: Now, Queue] --- s2[Team] --- s3[Me]
  end
  subgraph Closer
    c1[Today: Now, Queue] --- c2[Team] --- c3[Me]
  end
  subgraph Owner
    o1[Business: Now, Money, Source] --- o2[Team] --- o3[Me]
  end
```

- Reps get Today, Team, Me. The owner gets Business, Team, Me. Exactly three, from [`src/components/shell/nav.ts`](../src/components/shell/nav.ts).
- The role comes from the stored session in [`src/lib/session.tsx`](../src/lib/session.tsx).
- Connect and Import are owner only. A rep who lands there is sent home ([`ConnectScreen.tsx`](../src/components/connect/ConnectScreen.tsx), [`ImportScreen.tsx`](../src/components/import/ImportScreen.tsx)).

## 3. The entity chain

A person is not a lead. A lead is not a deal. A deal is not a payment. Opportunity is the hub; everything under it carries its id.

```mermaid
flowchart TB
  Contact -->|1 to many| LeadSubmission
  Contact -->|contactIds| Opportunity
  LeadSubmission -.->|opens, intake id| Opportunity
  Opportunity -->|1 to many| Assignment
  Opportunity -->|1 to many| Task
  Opportunity -->|1 to many| Call
  Opportunity -->|1 to many| Appointment
  Appointment -->|1 to many| AppointmentInstance
  Opportunity -->|1 to many| QualificationAssessment
  Opportunity -->|1 to many| Contract
  Contract -.->|optional| LedgerEntry
  Opportunity -->|1 to many| LedgerEntry
  Opportunity -->|1 to many| CommissionEntry
  Opportunity -.->|optional| DomainEvent
```

- `tenant_id` on every box.
- Money is integer cents with a currency. Unknown is a valid value.
- A duplicate submission is recorded but never opens a second opportunity.
- Every change is appended to `DomainEvent` with an idempotency key and evidence refs.

Source: [`src/domain/types.ts`](../src/domain/types.ts), [`src/domain/events.ts`](../src/domain/events.ts).

## 4. How a stage moves

Each hop names its proof. The rep confirms only when the proof is unsure.

```mermaid
flowchart TB
  L[Lead] -->|Webhook, dedupe, routing record. AUTO| A[Assigned]
  A -->|Dialer event + call intelligence. AUTO, confirm if unsure| C[Contacted]
  C -->|Calendar event. AUTO| B[Booked]
  B -->|Pre-call review, DQ reason. AUTO, confirm on DQ| R[Retained]
  R -->|Meeting participant join. AUTO. Rep records phone and in person| S[Show]
  S -->|Extraction + rep perception. AUTO. Rep records perceived fit| F[Fit]
  F -->|Signed contract. AUTO| W[Won]
  W -->|Ledger entry. AUTO| K[Cash]
```

AI never writes: **Money**, **Consent**, **Attendance**. The model proposes. A policy function moves the stage. Providers and the ledger own the facts that matter most.

Source: [`docs/PRD.md`](./PRD.md) section 10, [`src/domain/callIntelligence.ts`](../src/domain/callIntelligence.ts) (`FORBIDDEN_AI_EVENT_TYPE`), [`src/domain/dialer.ts`](../src/domain/dialer.ts).

## 5. Where the numbers come from

No metric is a bare number. Every one carries its parts.

```mermaid
flowchart LR
  P["MetricPayload<br/>numerator 71<br/>denominator 85<br/>unknownCount 0<br/>cohortId<br/>maturity (asOf)<br/>dataState"]
  P --> C["Connector<br/>rate only when nested<br/>attended parent = retained"]
  P --> O["Outline<br/>benchmark + sample + complete data<br/>else neutral"]
  P --> T["Team rate<br/>sum of num / sum of den<br/>not a mean of percents"]
  C --> W["83.5%<br/>71 attended / 85 retained bookings"]
```

- Zero denominator shows N/A, never 0%. Unknown stays unknown.
- A connector renders only when the numerator stage's parent is the denominator stage (`computeFunnel`).
- Outline needs a benchmark, a sample at or above `minDenominator`, and a `complete` data state; otherwise neutral or a data-state treatment (`evaluate`).
- Team rate is pooled numerator over pooled denominator (`computeTeamRate`).

Source: [`src/domain/metrics.ts`](../src/domain/metrics.ts), [`src/domain/performance.ts`](../src/domain/performance.ts), [`src/domain/types.ts`](../src/domain/types.ts) (`MetricPayload`, `FunnelStage`).

## 6. How leads arrive

Two doors. One hallway. Every lead walks the same four steps.

```mermaid
flowchart TB
  subgraph Connect [Connect, OAuth first]
    m[Meta, Google, Calendly, GHL, DMs, Zapier, email, share link]
  end
  subgraph Import [Import, OAuth CRM sync first, file second]
    h[HubSpot, GHL, Salesforce, Zoho, Pipedrive, Close]
  end
  Connect --> I
  Import --> I
  I["intake.ts<br/>Normalize, Identify, Dedupe, Consent"] --> R[routing.ts]
```

- Identity is phone first, then email, never name alone. Consent is never assumed.
- Files, keys and webhooks exist only for tools with no OAuth, and sit below it.
- A replayed provider event changes nothing.

Source: [`src/domain/intake.ts`](../src/domain/intake.ts) (`ingest`), [`src/domain/integrations.ts`](../src/domain/integrations.ts), [`src/domain/crmSync.ts`](../src/domain/crmSync.ts), [`src/domain/migration.ts`](../src/domain/migration.ts).

## 7. How a lead is assigned

A ladder. Each rung narrows the field. The last two only watch.

```mermaid
flowchart TB
  s1["1. Permission: consent, role, language, offer"] --> s2["2. Continuity: same rep if still able"]
  s2 --> s3["3. Capacity: open intake slots"]
  s3 --> s4["4. Service level: available now, or soonest"]
  s4 --> s5["5. Fair share: round robin, newcomer pool"]
  s5 -.-> s6["6. Validated performance: shadow, logged"]
  s6 -.-> s7["7. Relational preference: shadow, logged"]
  s5 --> E["Explanation: 'Assigned to Rep B: English support, three open intake slots, available now. Personality information was not used.'"]
```

Steps 1 to 5 decide. Steps 6 and 7 are computed into `Assignment.shadow`, never applied. A manager can read the result in `Assignment.explanation`.

Source: [`src/domain/routing.ts`](../src/domain/routing.ts) (`route`).

## 8. What earns XP

Verified events only. Never clicks, dials or notes. Three tracks: Cash, Craft, Team.

```mermaid
flowchart LR
  subgraph Cash
    a[Real conversation 10] --- b[Booking held 20] --- c[Fit verified 30] --- d[Show 40] --- e[Signed 60] --- f[Cash in 100]
  end
  subgraph Craft
    g[Practice rep 15]
  end
  subgraph Team
    h[Clean handoff 25]
  end
  Cash --> L[Levels: 0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000]
  Craft --> L
  Team --> L
```

- Season: monthly reset of the display. History stays.
- Quality gate: a refund, dispute or opt-out pauses the mechanic for that rep.
- Mission: carries a proof rule, not a checkbox. One active.
- XP never converts to pay.

Source: [`src/domain/game.ts`](../src/domain/game.ts) (`XP_TABLE`, `LEVELS`, `qualityGate`), [`src/domain/gamification.ts`](../src/domain/gamification.ts) (`seasonFor`, `missionFromRecommendation`).

## 9. What the money is

A verbal yes is a task. A signature is not cash. Cash is not profit.

```mermaid
flowchart TB
  v[Verbal yes, a task] --> p[Proposal sent]
  p --> s[Signed] --> a[Payment authorized] --> c[Collected] --> d[Delivery accepted]
  s -.-> CV[Contracted value: Contract.value at signed]
  c -.-> NC[Net collected cash: ledger, net of refunds and disputes]
  RR[Reported revenue: imported, basis unknown]
  subgraph Ledger movements
    m1[+ payment] ~~~ m2[- refund] ~~~ m3[- dispute debit]
  end
```

- Three bases, always labeled: reported revenue, contracted value, net collected cash.
- Refunds and disputes are ledger entries, never edits.
- Commission per attended appointment is not an hourly rate.
- Scenarios are not forecasts. Benchmark gaps are not lost money.
- The commission policy is a labeled hypothesis until D06.

Source: [`src/lib/workspace-closer.ts`](../src/lib/workspace-closer.ts) (`LADDER_STEPS`), [`src/domain/types.ts`](../src/domain/types.ts) (`RevenueBasis`, `LedgerEntryKind`), [`src/domain/events.ts`](../src/domain/events.ts) (`netCollectedFromLedger`), [`src/domain/metrics.ts`](../src/domain/metrics.ts) (M18).

## 10. What is real today and what is simulated

The logic is built. The wires to the outside world wait on three decisions.

```mermaid
flowchart LR
  subgraph Real
    r1[Domain logic: 17 modules in src/domain]
    r2[Tests: 17 unit files, 8 journeys]
    r3[Screens: setter, closer, owner, team]
    r4[Schema: supabase/migrations]
  end
  subgraph Simulated [Simulated until credentials]
    s1[OAuth handshakes: SimulatedAuthorizer]
    s2[Dialer: SimulatedDialerAdapter]
    s3[Transcription: RuleBased, Stub]
    s4[Payments: synthetic ledger fixture]
  end
  D04[D04 providers] --> s1
  D04 --> s2
  D05[D05 recording, retention] --> s3
  D06[D06 commission agreement] --> s4
```

- Same interfaces, swapped adapters. The app runs with zero outside credentials; an in-memory fixture is the default.
- Nothing in `supabase/` is applied without explicit sign-off.

Source: [`docs/spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md`](./spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md) (D04, D05, D06), [`docs/ROADMAP.md`](./ROADMAP.md) phase 7, [`src/domain/integrations.ts`](../src/domain/integrations.ts), [`src/domain/dialer.ts`](../src/domain/dialer.ts), [`src/domain/callIntelligence.ts`](../src/domain/callIntelligence.ts), [`src/domain/crmSync.ts`](../src/domain/crmSync.ts).
