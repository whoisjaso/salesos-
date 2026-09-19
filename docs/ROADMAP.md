# Roadmap: phased delivery

Phases are ordered so each ships a usable increment and each maps to the SOS-25 delivery gates. The owner authorized a full product build; the gates are kept as evidence checkpoints, not as reasons to stop.

| Phase | Deliverable | Spec gates | Exit evidence |
|---|---|---|---|
| 0 | PRD, ADR, roadmap, story map, spec pack in repo | Gate 0 | Docs committed. |
| 1 | Domain core: entities, metric engine M01 to M21, glow policy, routing precedence, capacity, coaching rules, leaderboard views, fixtures reproducing the corrected SOS-01 sheet | Gate 2 (evidence contracts) | Vitest suite green covering the SOS-02, SOS-03, SOS-06, SOS-14, SOS-16 acceptance criteria. |
| 2 | Design system and app shell: tokens, dark off-black theme, subtle performance outlines, funnel cards with valid connectors, animated count-ups, role navigation | Gate 3 | Renders with fixtures. Reduced motion respected. Keyboard reachable. |
| 3 | Owner dashboard: trust, economic, flow, capacity, decision layers. Bottleneck cards. Benchmark opportunity scenario labeling. | Gate 3 | Owner can distinguish cash from contract, actual from modeled. |
| 4 | Setter and closer workspaces: next action, queue with explained priority, call state machine, booking, handoff brief, pre-call brief, live checklist, honest financial states | Gate 3 | Rep completes inquiry to handoff on one screen. |
| 5 | Leaderboard (output, comparable, personal progress), missions, skill paths, seasons, coaching cards | Gate 5 | Six-lead outlier shows provisional. Tiers visible. No composite score. |
| 6 | Persistence: Supabase migration SQL, repository adapter, domain event log, ledger, provider event inbox with idempotency | Gate 2 | Migration reviewed. Duplicate event test passes against adapter. Not applied to a live project without authorization. |
| 7 | Live integrations behind adapters (telephony, calendar, meetings, payments), AI coaching via LLM behind schema validation, shadow-mode relational pairing | Gates 4, 6 | Requires D04, D05, D06 resolved. |
| 8 | Productization: multi-tenant onboarding, exports, appeals workflow, dealer-facing variant as a separate domain module | Gate 7 | Requires D01 resolved. |

Phases 1 to 6 are built in this repository now. Phases 7 and 8 are designed (interfaces and tables exist) and blocked on the open decisions in SOS-28.
