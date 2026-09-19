# Agent instructions for this repository

1. Read `docs/spec/AGENTS.md`, then `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`.
2. The spec modules in `docs/spec/` govern product intent. `src/domain/types.ts` governs the code contract. When they disagree, fix the contract and note it in `docs/spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md`.
3. Domain code is pure. No React, no fetch, no `Date.now()` inside `src/domain`. Inject `now`.
4. Never return a bare number for a metric. Return `MetricPayload`.
5. Never store or sum money as floats. Minor units and ISO currency only.
6. UI copy: no em dashes, no color-only meaning, every performance state has a text label and an icon, reduced motion respected.
7. Do not apply `supabase/migrations` to a live project, send messages, call providers, or change commission logic without explicit authorization from the owner.
8. Tests before claims. `npm test` and `npm run build` must be green before a push.
9. Fixtures are synthetic and labeled synthetic. The source sheet is a visual reading, not verified operating data.
