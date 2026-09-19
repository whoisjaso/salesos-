---
document_id: SOS-20
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# User experience and visual metric language

**Read with:** [02_METRIC_CONTRACTS.md](02_METRIC_CONTRACTS.md), [09_SETTER_WORKSPACE.md](09_SETTER_WORKSPACE.md), [10_CLOSER_WORKSPACE.md](10_CLOSER_WORKSPACE.md), [14_LEADERBOARDS_AND_FAIR_COMPARISONS.md](14_LEADERBOARDS_AND_FAIR_COMPARISONS.md), [29_SOURCES_AND_RESEARCH.md](29_SOURCES_AND_RESEARCH.md)

## In plain language

The user wants the funnel to be understandable immediately, with clean stage cards, subtle performance outlines, and a clear overall view. The interface should feel premium because it is coherent and useful, not because it glows everywhere.

## Design objectives

Prioritize the next action for reps and the next decision for owners. Use consistent naming, alignment, spacing, typography, number formatting, and interaction behavior. Avoid a giant table as the only interface, but preserve a detailed reconciliation table behind the concise view.

No screenshot, visual mockup, or working interface is being delivered by this Markdown file. These are implementable design requirements.

## Funnel card anatomy

Each card includes the stage name, count, time/cohort context, and data state. A connector shows the stage-specific rate only when the denominator relationship is valid. Supporting text reveals numerator and denominator, such as `71 attended / 85 retained bookings`.

A revenue card labels its basis: `Reported revenue`, `Contracted value`, or `Net collected cash`. It must not use an unlabeled dollar amount when multiple bases exist. Clicking any metric opens the definition and counted records.

For the corrected source example, the display is:

`129 assigned source leads → 85 retained bookings → 71 shows → 58 perceived qualified → 21 wins → $686,000 reported revenue`.

This source-reproduction sequence is not the generic operational workflow for every offer.

## Performance state and glow

Each metric has a definition, favorable direction, matched benchmark, threshold policy, sample/maturity requirement, and current data state. Never use `above 50% = green` across the entire funnel.

The system supports:

- **On target / strong:** a subtle green outline plus a text label and appropriate icon.
- **Needs attention:** amber outline plus explanation.
- **Material issue:** restrained red treatment with the actual issue, not personal blame.
- **No valid benchmark:** neutral.
- **Insufficient sample or immature cohort:** provisional neutral treatment.
- **Unknown/stale/incomplete:** explicit data-state treatment, not a performance verdict.

The user can configure stage-specific operational targets. Those targets are company policy or experimental hypotheses, not universal industry benchmarks. DQ and qualification measures may have contextual or non-monotonic goals; lower or higher is not automatically better.

## Overall performance indicator

Do not literally mix stage colors and interpret the resulting color as a calculated salesperson grade. The preferred summary is primary economic efficiency, quality/data state, and the largest supported stage issue.

An optional composite score requires a versioned, approved rubric, normalization, weights, missing-data rules, and sensitivity review. Show its components. It must not silently influence pay or allocation. Early releases should omit the composite rather than invent arbitrary weights.

## Role-specific layout

**Setter home:** next action, active customer, upcoming commitments, queue, compact daily activity, one coaching task, optional progress.

**Closer home:** upcoming appointment brief, open decisions, proposals/contracts/payment tasks, personal funnel and quality context.

**Owner home:** acquisition and collected-cash overview, comparable funnel, capacity, major data incidents, prioritized bottleneck investigations, and a link to team comparisons.

**Team learning:** approved stage examples, practice paths, missions, and transparent leaderboard rules. Customer-sensitive material is not broadly exposed just because the leaderboard is shared.

## Interaction details

Hover can reveal context, but every hover interaction must also work on tap, keyboard focus, and touch. Use accessible labels, visible focus, logical reading order, and text equivalents for graphical measures. W3C's guidance states that color must not be the sole visual means of conveying information; this directly informs the proposed label/icon treatment. [S04]

Respect reduced-motion preferences. Do not pulse continuously, flash warnings, or animate leaderboard movement during a live call. Keep action positions stable to avoid accidental calls or messages. Tooltips should not hide essential definitions available nowhere else.

## Display precision and uncertainty

Use readable units and consistent rounding. Preserve full calculation precision underneath. Percentages should show counts and distinguish percentage-point changes from relative percent changes. A move from 50% to 60% is +10 percentage points, not simply `up 10%`.

Show confidence/uncertainty only when computed by a declared method; otherwise use plain statements such as `small sample` or `descriptive comparison`. Never draw a statistical-looking band with invented limits.

## Empty, loading, error, and degraded states

Empty: explain what evidence is needed and offer the next legitimate setup action.

Loading: maintain layout and show pending status without an invented zero.

Stale: show last update and affected decisions; consequential ranking actions may pause.

Error: show a recovery action and owner, not a generic failure toast that disappears.

Partial evidence: show confirmed values and unknown counts rather than normalizing away missing data.

## Design review and acceptance

Before implementation, test the concept with at least one representative and an owner through realistic tasks. Ask them to identify the next action, explain a rate, distinguish reported from collected money, and find why a rank changed. This is a usability exercise, not proof of commercial lift.

A user must be able to read the funnel without interpreting color alone; identify Unknown versus poor performance; use it on mobile and keyboard; inspect the denominator; distinguish provisional from actual; and complete the core action without navigating a dense CRM menu.

## Agent task prompt

```text
Design the text-level UX specification for one role. Include information hierarchy, funnel-card anatomy, valid connectors, benchmark and glow states, accessible equivalents, interactions, and empty/loading/error states. Preserve subtle green/amber/red performance outlines without universal thresholds or color-only meaning. Do not create a composite score from mixed colors or disguise missing data as zero.
```

