# Decision log

Owner decisions made during the build, in order. Each one updates the relevant spec module or the open-decision register (SOS-28).

## 2026-09-19

**Design law: one hero, one number, one action.** Every role screen shows one hero card, one primary number, and one primary action above the fold on a phone. Everything else lives behind a segmented control (Now / Queue for reps, with Me as its own tab; Now / Money / Source for the owner, with Team as its own tab) or a Sheet. Explanatory sentences are cut to labels. Applies to SOS-09, SOS-10, SOS-20, SOS-21 implementations.

**Gamification is first-class, evidence-only.** XP comes only from verified stage events (two-way contact, retained booking, attended show, verified fit, signed, cash collected, accepted handoff, completed practice). Three tracks: commercial, mastery, team. Levels, monthly season, streaks tolerant of approved leave, one active mission with its proof rule. Quality incidents pause the mechanic per rep. Implemented in `src/domain/game.ts`. Never converts to pay (SOS-15, D06).

**Automatic stage capture is the product.** Each A to B transition has a declared evidence source and a confirm-only-when-ambiguous rule. See the table in `docs/PRD.md` section 10.

**Call intelligence, not a third-party notetaker.** Record through the business-owned dialer, transcribe, extract with a fixed schema (outcome, commitments, stakeholders, objections, next step) where every field cites a transcript span. The policy engine moves the stage; the model proposes. Reps can dispute any extracted field. Phase 7, blocked on D04 and D05.

**Warm-lead power dialer.** Queue ordered by promise time, reply urgency, lead freshness. One tap dials the next lead through the business number, consent checked at dial time, lease prevents double dialing. Auto-advance mode later. Never cold or random numbers. Phase 7, blocked on D04 and D05.

**Native by role.** A person signs in as who they are and never sees another role's world. Reps: Today, Team, Me. Owner: Business, Team, Me. Three tabs, no role switcher, no page headers or subtitles, no persona pickers. Learning the app should take zero explanation. Applies to the shell and every route.

**Test from every angle.** Automated journeys per role, not page screenshots: setter lead to handoff, closer join to verbal yes with zero collected, owner business to bottleneck assignment, rep blocked from owner routes. Run on every build.

**Leads from anywhere, one intake.** A universal intake layer normalizes any source (Meta and Google lead forms, VSL and landing page webhooks, calendar bookings, share links for organic and DMs, manual, Zapier and Make, email forward, CSV) into one LeadSubmission with source and entry path stamped, central dedupe and consent capture. Owner gets a Sources screen with per-source health and a three-step add flow. Implemented in `src/domain/intake.ts`.

**OAuth first, always.** For every connection and every data transfer, the first option is Connect, authorize in the tool they already use, done. Files, API keys, and webhooks exist only for tools that offer no OAuth, and appear below the OAuth option, never beside it. Applies to Connect, Import, and any future sync. Implemented in `src/domain/crmSync.ts` and the Connect and Import screens.

**Every brand gets its real logo.** Wherever another company is named, its actual mark is shown, never a letter tile. Simple Icons silhouettes painted in brand color where available; otherwise the official favicon or a color SVG rendered as-is. Generic items (share link, spreadsheet) use a neutral icon. Registry: `logo` override on each provider in `src/domain/integrations.ts`.

**Bring existing data in without friction.** An Import flow matches an old CRM export or spreadsheet to our schema by header and value shape, with exact presets for HubSpot, GoHighLevel, Salesforce, Pipedrive, Zoho, Close, and Google Sheets. The owner reviews only the columns we are unsure about, sees a dry run before anything writes, and every imported record carries its source row. Imported consent never overwrites a newer opt-out. Implemented in `src/domain/migration.ts` and the owner `/import` screen.

**Personality routing signals.** Customer's own words and texting style: allowed as hypotheses that a real exchange must confirm (SOS-07 lens library). One explicit question in the funnel ("Numbers first, or see how it works?") is the primary pairing signal. Profile-picture or appearance inference: rejected. Unreliable and a legal exposure; the spec already excludes it (SOS-07, SOS-23).
