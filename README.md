# Sales OS

The place a sales team works, not another database it has to babysit.

One loop: receive an opportunity, assign it responsibly, act, verify what happened, guide the next step, measure the result, improve the process.

## What is here

| Path | What |
|---|---|
| `docs/spec/` | The 31-module product specification (SOS-00 to SOS-30). Source of truth for intent. |
| `docs/PRD.md` | Condensed requirements and the non-negotiable semantics. |
| `docs/ARCHITECTURE.md` | Architecture decision record. |
| `docs/ROADMAP.md` | Phase plan mapped to the spec's delivery gates. |
| `docs/stories/` | Story map by epic. |
| `src/domain/` | Pure TypeScript: metric engine (M01 to M21), performance outlines, routing, capacity, coaching, leaderboard, events. Fully unit tested. |
| `src/fixtures/` | Corrected source-reproduction sheet (SOS-01) and a synthetic Obavia operating cohort. |
| `src/data/` | Repository interface, in-memory adapter (default), Supabase adapter. |
| `src/components/` | Design system: funnel cards, metric tiles, performance outlines, shell. |
| `src/app/` | Role routes: `/owner`, `/setter`, `/closer`, `/team`, `/coach`, `/playbooks`. |
| `supabase/` | SQL migration mirroring the domain model. Not applied without authorization. |

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest, domain and data layers
npm run build
```

No environment variables are required. The app runs on the in-memory fixture adapter. Set `NEXT_PUBLIC_SUPABASE_URL` and a key to switch to the Supabase adapter (see `supabase/README.md`).

## Rules the code enforces

- Every percentage carries numerator, denominator, cohort, maturity, and data state.
- Zero denominator is N/A, never zero.
- Retained bookings, dial attempts, conversations, and attendance are different numbers.
- Reported revenue, contracted value, and net collected cash are labeled and never mixed.
- Unknown is a valid state and is never converted to zero or No.
- Performance outlines need a benchmark, a sample threshold, and complete data. Otherwise neutral.
- Benchmark gaps are scenarios, not lost money and not employee debt.
- Personality pairing runs in shadow mode. Eligibility, continuity, capacity, and service level come first.

## Working on this repo with an AI agent

Read `AGENTS.md` at the repo root first, then `docs/spec/AGENTS.md`.
