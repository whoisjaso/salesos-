# Sales OS persistence (Supabase / Postgres)

Schema on disk for Phase 6. Governing specs: SOS-03 (domain model), SOS-05 (data
quality and field authority), SOS-19 (ledger), SOS-22 (architecture, reliability),
SOS-23 (security), and `docs/ARCHITECTURE.md`.

## Not applied. Gated on open decisions.

**Nothing in this directory has been applied to any Supabase project.** Applying it is
gated on two open decisions in `docs/spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md`:

- **D04**: the actual CRM, calling, scheduling, meeting, and payment providers. Until
  chosen, the field authority registry cannot name an authoritative system for
  provider-owned fields, and the connector inbox has no producers.
- **D14**: engineering maintainer, budget, hosting, export, and recovery plan. A live
  database is a production component and SOS-22 requires an owner for migrations,
  backups, restore tests, and rollback before one exists.

Do not run `supabase db push`, the MCP `apply_migration` tool, or `psql -f` against any
project until the owner has recorded those decisions and explicitly authorized it.

## Files

| Path | Purpose |
|---|---|
| `migrations/20260918000000_sales_os_core.sql` | Core schema mirroring `src/domain/types.ts`: tenants, users, contacts, lead_submissions, offers, opportunities, assignments, tasks, calls, appointments, appointment_instances, qualification_assessments, communication_profiles, contracts, ledger_entries, commission_policies, commission_entries, domain_events, provider_events (connector inbox), outbox (action leases), coaching_recommendations, field_authority_registry. Functions `set_tenant`, `current_tenant_id`, `reserve_task`, `release_task`. View `v_funnel_counts`. |

The TypeScript adapters live in `src/data/`:

- `repository.ts` is the `Repository` interface (every method takes `tenantId`).
- `memory.ts` is the default, credential-free adapter and the reference semantics.
- `supabase.ts` is the Postgres adapter over `@supabase/supabase-js`.
- `index.ts` picks one from the environment.

## How to apply (once authorized)

Option A, Supabase CLI against a linked project:

```sh
supabase link --project-ref <ref>
supabase db push            # applies every file in supabase/migrations in order
```

Option B, local stack first (preferred; SOS-22 says test locally before remote):

```sh
supabase start
supabase db reset           # recreates the local database from migrations
```

Option C, MCP `apply_migration` with `name: "sales_os_core"` and the file contents as
`query`. Same gate applies. Prefer a branch (`create_branch`) over the main project.

The file is wrapped in a single transaction, so a failure leaves nothing behind.

## Design rules encoded in the schema

- `tenant_id` is `text` on every business table and part of every primary key, so the
  key is `(tenant_id, <id>)`. Every foreign key carries `tenant_id` too, which makes a
  cross-tenant id collision structurally impossible to follow (SOS-03).
- Money is `amount_minor bigint` plus `currency char(3)`. Never a float, never a
  currency-less number (SOS-19). Ledger amounts are positive magnitudes; `kind` gives the
  sign. Commission rates are `numeric`, not `double precision`.
- All timestamps are `timestamptz`. Occurrence and receipt are separate columns on
  ledger entries, provider events, and domain events.
- Enumerations are `check` constraints mirroring the union types in
  `src/domain/types.ts` (for example the exact SOS-12 `appointment_instances.outcome` set).
- `contacts.consent` is `jsonb` with a check that all three channels are present and each
  is `granted`, `revoked`, or `unknown`. Consent is canonical here and enforced across
  connectors (SOS-22).
- Idempotency: `tasks`, `ledger_entries`, `domain_events`, and `outbox` are unique on
  `(tenant_id, idempotency_key)`; `provider_events` is unique on
  `(tenant_id, provider, provider_account_id, provider_event_id)`. A redelivery is a
  unique violation (`23505`), which the adapter maps to `{ applied: false, reason: "duplicate" }`.
- Corrections are new rows. `domain_events.supersedes_event_id` and
  `appointment_instances.supersedes_instance_id` are self-referencing foreign keys; the
  original row stays. `update`/`delete` on `domain_events` and `ledger_entries` are
  revoked from `anon` and `authenticated` when those roles exist.
- Leases: `reserve_task` and `release_task` are compare-and-set updates inside the
  database, so two workers cannot both hold a task even over HTTP. `outbox` carries
  `lease_holder`, `lease_expires_at`, `attempts`, `max_attempts`, `next_attempt_at`.
- `field_authority_registry` holds one row per field: `authoritative_system`,
  `allowed_writers`, `mapping`, `conflict_behavior`
  (`authoritative_wins | newest_wins | manual_review | reject`), `reconciliation_owner`,
  `export_path`. It is data, not code, so a configured CRM can own a field without a deploy.
- `v_funnel_counts` is a plain view that records `definition_version` and a `watermark`
  column (SOS-03: every projection records its definition version and processing
  watermark). It returns counts only; rates belong to the metric engine, which returns
  `MetricPayload` rather than bare numbers.

## Tenant setting and Row Level Security

Every table has RLS enabled and forced, with one policy:

```sql
using (tenant_id = current_setting('app.tenant_id', true))
with check (tenant_id = current_setting('app.tenant_id', true))
```

`current_setting(..., true)` returns `NULL` when the setting is absent, and `NULL` never
equals a `tenant_id`, so an unscoped session can neither read nor write any row.

The setting is made through the `set_tenant(p_tenant_id text)` function, which is
`SECURITY DEFINER` and calls `set_config('app.tenant_id', p_tenant_id, false)` for the
current session.

Which connection path you use matters:

| Path | Does `set_tenant` scope later statements? | What isolates tenants |
|---|---|---|
| Direct Postgres connection, or pooler in session mode, `select set_tenant(...)` then queries | Yes | RLS |
| Single RPC / SQL function that calls `set_tenant` and does its own work in the same call | Yes, within that call | RLS |
| `@supabase/supabase-js` over PostgREST (what `src/data/supabase.ts` uses) | **No.** Each HTTP request is its own transaction; a setting from one request does not survive to the next. | Explicit `tenant_id` filter on every statement in the adapter (server-side, SOS-22) |

Consequences for `SupabaseRepository`:

1. It filters every read and write by `tenant_id` itself. It also rejects a write whose
   payload names a different tenant than the call (`reason: "invalid"`), so a row can
   never be misfiled.
2. It exposes `setTenant(tenantId)` for callers on a session-holding connection; the
   adapter does not depend on it.
3. It is meant to run with `SUPABASE_SERVICE_ROLE_KEY` on the server only. The service
   role bypasses RLS, which is why (1) is not optional. With
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` the RLS policy applies and, over PostgREST, every
   request will see zero rows unless a future JWT-claim policy is added. That is the
   intended fail-closed behavior, not a bug.

Never ship the service role key to a browser bundle. `NEXT_PUBLIC_*` variables are
public by construction; only the URL and anon key carry that prefix.

### Environment variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (required to select the Supabase adapter) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key, preferred |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Fallback key, subject to RLS |

With none set, `getRepository()` returns the in-memory adapter seeded from
`src/fixtures/obavia` (or an empty dataset if that module is absent).

## What is intentionally not here

- No seed data. Fixtures are labeled synthetic and live in `src/fixtures/` for the
  memory adapter; loading them into a database is a separate, authorized step.
- No evidence payload storage. Recordings and transcripts belong in restricted object
  storage with retention controls (SOS-23); tables carry `evidence_refs` only.
- No JWT-based tenant policy. Adding `auth.jwt() ->> 'tenant_id'` to the policy is a
  one-line follow-up once the identity provider is chosen (D04).
- No triggers that write money, attendance, or permission from AI output. The LLM
  proposes; a policy function decides (ARCHITECTURE "AI boundary").
