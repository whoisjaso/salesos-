# Decision log

Owner decisions made during the build, in order. Each one updates the relevant spec module or the open-decision register (SOS-28).

## 2026-09-19

**Design law: one hero, one number, one action.** Every role screen shows one hero card, one primary number, and one primary action above the fold on a phone. Everything else lives behind a segmented control (Now / Queue / Me for reps; Now / Money / Team / Source for the owner) or a Sheet. Explanatory sentences are cut to labels. Applies to SOS-09, SOS-10, SOS-20, SOS-21 implementations.

**Gamification is first-class, evidence-only.** XP comes only from verified stage events (two-way contact, retained booking, attended show, verified fit, signed, cash collected, accepted handoff, completed practice). Three tracks: commercial, mastery, team. Levels, monthly season, streaks tolerant of approved leave, one active mission with its proof rule. Quality incidents pause the mechanic per rep. Implemented in `src/domain/game.ts`. Never converts to pay (SOS-15, D06).

**Automatic stage capture is the product.** Each A to B transition has a declared evidence source and a confirm-only-when-ambiguous rule. See the table in `docs/PRD.md` section 10.

**Call intelligence, not a third-party notetaker.** Record through the business-owned dialer, transcribe, extract with a fixed schema (outcome, commitments, stakeholders, objections, next step) where every field cites a transcript span. The policy engine moves the stage; the model proposes. Reps can dispute any extracted field. Phase 7, blocked on D04 and D05.

**Warm-lead power dialer.** Queue ordered by promise time, reply urgency, lead freshness. One tap dials the next lead through the business number, consent checked at dial time, lease prevents double dialing. Auto-advance mode later. Never cold or random numbers. Phase 7, blocked on D04 and D05.

**Native by role.** A person signs in as who they are and never sees another role's world. Reps: Today, Team, Me. Owner: Business, Team, Me. Three tabs, no role switcher, no page headers or subtitles, no persona pickers. Learning the app should take zero explanation. Applies to the shell and every route.

**Personality routing signals.** Customer's own words and texting style: allowed as hypotheses that a real exchange must confirm (SOS-07 lens library). One explicit question in the funnel ("Numbers first, or see how it works?") is the primary pairing signal. Profile-picture or appearance inference: rejected. Unreliable and a legal exposure; the spec already excludes it (SOS-07, SOS-23).
