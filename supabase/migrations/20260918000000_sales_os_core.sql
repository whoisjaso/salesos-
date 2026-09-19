-- =============================================================================
-- Sales OS core schema (Phase 6, persistence layer)
--
-- Governing specs:
--   SOS-03  Domain model, event history, and state transitions
--   SOS-05  Attribution and data quality (identity, dedupe, field authority)
--   SOS-19  Revenue, commissions, and forecasts (ledger in minor units)
--   SOS-22  Technical architecture (inbox/outbox, leases, one writer per field,
--           server-side tenant filters)
--   SOS-23  Security, consent, and AI controls (tenant-scoped, server-enforced)
--   docs/ARCHITECTURE.md (ADR: modular monolith, repository interface)
--
-- Mirrors src/domain/types.ts. That file is the contract; this file follows it.
--
-- STATUS: NOT applied to any project; requires explicit authorization
--         (open decisions D04, D14 in docs/spec/28_TRACEABILITY_AND_OPEN_DECISIONS.md).
--
-- Conventions
--   * tenant_id is text on every business table. Every business table has a
--     composite primary key (tenant_id, <id>) so a cross-tenant id collision can
--     never resolve to another tenant's row, and every foreign key carries
--     tenant_id (SOS-03 "Cross-tenant identifiers never grant cross-tenant access").
--   * Money is never a float: amount_minor bigint + currency char(3) (SOS-19).
--   * All timestamps are timestamptz. Occurrence and receipt are separate columns.
--   * Row Level Security is enabled and forced on every table. The policy keys on
--     current_setting('app.tenant_id', true), set through the set_tenant() function
--     below (see supabase/README.md for the caveats of each connection path).
--   * Enumerations are check constraints, not Postgres enums, so a domain change is
--     an additive migration rather than a type rewrite.
-- =============================================================================

begin;

create extension if not exists pgcrypto; -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Tenant context
-- -----------------------------------------------------------------------------

-- Sets the tenant for the current session (is_local = false) so every RLS policy
-- in this file resolves against it. SECURITY DEFINER so that a role which is not
-- allowed to touch the tables can still declare which tenant it acts for; the
-- policy then decides what it may see.
--
-- Caveat (documented in supabase/README.md): the setting lives on the Postgres
-- session. Over the PostgREST HTTP API every request is its own transaction, so a
-- prior set_tenant RPC does not carry over. The TypeScript SupabaseRepository
-- therefore filters every statement by tenant_id explicitly as well.
create or replace function public.set_tenant(p_tenant_id text)
returns void
language sql
security definer
set search_path = public
as $$
  select set_config('app.tenant_id', p_tenant_id, false);
$$;

create or replace function public.current_tenant_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.tenant_id', true), '');
$$;

-- -----------------------------------------------------------------------------
-- Tenancy, people
-- -----------------------------------------------------------------------------

create table public.tenants (
  tenant_id             text primary key,
  name                  text not null,
  timezone              text not null,
  reporting_currency    char(3) not null,
  maturity_horizon_days integer not null check (maturity_horizon_days >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.users (
  tenant_id             text not null references public.tenants(tenant_id),
  user_id               text not null,
  display_name          text not null,
  roles                 text[] not null default '{}',
  active                boolean not null default true,
  languages             text[] not null default '{}',
  capabilities          text[] not null default '{}',   -- audited, not self-described (SOS-07)
  self_described_style  text,
  started_at            timestamptz not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (tenant_id, user_id),
  constraint users_roles_valid check (
    roles <@ array['setter','closer','owner','manager','delivery']::text[]
  )
);

-- -----------------------------------------------------------------------------
-- Contacts and intake
-- -----------------------------------------------------------------------------

create table public.contacts (
  tenant_id          text not null references public.tenants(tenant_id),
  contact_id         text not null,
  display_name       text not null,
  organization_name  text,
  preferred_language text,
  preferred_channel  text check (preferred_channel in ('phone','sms','email','video')),
  -- Canonical communication permission per channel (SOS-22: enforced across connectors;
  -- an imported record must not overwrite a newer opt-out).
  consent            jsonb not null default '{"phone":"unknown","sms":"unknown","email":"unknown"}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (tenant_id, contact_id),
  constraint contacts_consent_shape check (
    jsonb_typeof(consent) = 'object'
    and consent ? 'phone' and consent ? 'sms' and consent ? 'email'
    and (consent->>'phone') in ('granted','revoked','unknown')
    and (consent->>'sms')   in ('granted','revoked','unknown')
    and (consent->>'email') in ('granted','revoked','unknown')
  )
);

create table public.lead_submissions (
  tenant_id                  text not null references public.tenants(tenant_id),
  submission_id              text not null,
  provider_event_id          text not null,
  source                     text not null,
  campaign                   text,
  lead_tier                  integer,
  entry_path                 text not null check (entry_path in ('form_entry','booked_entry','existing_customer_expansion')),
  received_at                timestamptz not null,
  request_text               text not null,
  contact_id                 text not null,
  duplicate_of_submission_id text,
  created_at                 timestamptz not null default now(),
  primary key (tenant_id, submission_id),
  foreign key (tenant_id, contact_id) references public.contacts(tenant_id, contact_id),
  foreign key (tenant_id, duplicate_of_submission_id) references public.lead_submissions(tenant_id, submission_id)
);

-- -----------------------------------------------------------------------------
-- Offers (referenced by opportunities and contracts)
-- -----------------------------------------------------------------------------

create table public.offers (
  tenant_id            text not null references public.tenants(tenant_id),
  offer_id             text not null,
  name                 text not null,
  version              text not null,
  list_price_minor     bigint not null check (list_price_minor >= 0),
  list_price_currency  char(3) not null,
  -- [{ id, label, delta: { amountMinor, currency } }]
  approved_options     jsonb not null default '[]'::jsonb check (jsonb_typeof(approved_options) = 'array'),
  -- { maxPercent, approverRole }
  discount_authority   jsonb not null check (jsonb_typeof(discount_authority) = 'object'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (tenant_id, offer_id)
);

-- -----------------------------------------------------------------------------
-- Opportunity and assignment
-- -----------------------------------------------------------------------------

create table public.opportunities (
  tenant_id                 text not null references public.tenants(tenant_id),
  opportunity_id            text not null,
  contact_ids               text[] not null default '{}',
  primary_contact_id        text not null,
  offer_id                  text not null,
  workflow_version          text not null,
  entry_path                text not null check (entry_path in ('form_entry','booked_entry','existing_customer_expansion')),
  source                    text not null,
  lead_tier                 integer,
  commercial_status         text not null check (commercial_status in ('open','won','lost','nurture','dq','reactivated')),
  accountability_started_at timestamptz not null,
  -- { setter?: userId, closer?: userId }. History lives in assignments.
  current_owner             jsonb not null default '{}'::jsonb check (jsonb_typeof(current_owner) = 'object'),
  contact_state             text not null check (contact_state in ('none','attempted','voicemail','two_way_contact')),
  fit_state                 text not null check (fit_state in ('unassessed','clarify','likely','unlikely','verified')),
  contract_state            text not null check (contract_state in ('none','proposed','signed')),
  payment_state             text not null check (payment_state in ('none','authorized','partially_collected','collected','refunded','disputed')),
  dq_reason                 text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  primary key (tenant_id, opportunity_id),
  foreign key (tenant_id, primary_contact_id) references public.contacts(tenant_id, contact_id),
  foreign key (tenant_id, offer_id) references public.offers(tenant_id, offer_id)
);

create table public.assignments (
  tenant_id              text not null references public.tenants(tenant_id),
  assignment_id          text not null,
  opportunity_id         text not null,
  role                   text not null check (role in ('setter','closer')),
  user_id                text not null,
  policy_version         text not null,
  decided_at             timestamptz not null,
  eligible_candidate_ids text[] not null default '{}',
  -- [{ userId, reason }]
  exclusions             jsonb not null default '[]'::jsonb check (jsonb_typeof(exclusions) = 'array'),
  selection_probability  double precision check (selection_probability is null or (selection_probability >= 0 and selection_probability <= 1)),
  explanation            text not null,
  accepted_at            timestamptz,
  ended_at               timestamptz,
  -- Steps 6/7 of SOS-06 computed but not applied: { performanceWeight?, relationalSuggestionUserId?, relationalReason? }
  shadow                 jsonb check (shadow is null or jsonb_typeof(shadow) = 'object'),
  created_at             timestamptz not null default now(),
  primary key (tenant_id, assignment_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, user_id) references public.users(tenant_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Tasks, calls, appointments
-- -----------------------------------------------------------------------------

create table public.tasks (
  tenant_id            text not null references public.tenants(tenant_id),
  task_id              text not null,
  opportunity_id       text not null,
  owner_user_id        text,
  action               text not null check (action in ('call','reply','confirm_appointment','review_dq','send_proposal','collect_payment','handoff_delivery','follow_up')),
  -- Discriminated union TaskPriorityReason, e.g. { kind: "scheduled_commitment", dueAt }
  priority             jsonb not null check (jsonb_typeof(priority) = 'object' and priority ? 'kind'),
  due_at               timestamptz,
  state                text not null check (state in ('unassigned','reserved','assigned','accepted','in_progress','awaiting_customer','completed','escalated','canceled')),
  idempotency_key      text not null,
  lease_holder_user_id text,
  lease_expires_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (tenant_id, task_id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, owner_user_id) references public.users(tenant_id, user_id),
  foreign key (tenant_id, lease_holder_user_id) references public.users(tenant_id, user_id),
  constraint tasks_lease_pair check (
    (lease_holder_user_id is null and lease_expires_at is null)
    or (lease_holder_user_id is not null and lease_expires_at is not null)
  )
);

create table public.calls (
  tenant_id            text not null references public.tenants(tenant_id),
  call_id              text not null,
  opportunity_id       text not null,
  user_id              text not null,
  direction            text not null check (direction in ('outbound','inbound')),
  provider_call_id     text,
  transport_state      text not null check (transport_state in ('queued','ringing','connected','ended','failed')),   -- provider fact
  started_at           timestamptz,
  ended_at             timestamptz,
  duration_seconds     integer check (duration_seconds is null or duration_seconds >= 0),
  interpreted_outcome  text not null check (interpreted_outcome in ('no_answer','voicemail','wrong_contact','meaningful_interaction','unknown')), -- interpretation, separate from transport
  outcome_confirmed_by text check (outcome_confirmed_by in ('rep','policy')),
  evidence_refs        text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (tenant_id, call_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, user_id) references public.users(tenant_id, user_id)
);

create table public.appointments (
  tenant_id      text not null references public.tenants(tenant_id),
  appointment_id text not null,
  opportunity_id text not null,
  type           text not null check (type in ('discovery','sales','follow_up')),
  modality       text not null check (modality in ('video','phone','in_person')),
  contact_id     text not null,
  rep_user_id    text not null,
  timezone       text not null,
  purpose        text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, appointment_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, contact_id) references public.contacts(tenant_id, contact_id),
  foreign key (tenant_id, rep_user_id) references public.users(tenant_id, user_id)
);

create table public.appointment_instances (
  tenant_id                 text not null references public.tenants(tenant_id),
  instance_id               text not null,
  appointment_id            text not null,
  opportunity_id            text not null,
  scheduled_start           timestamptz not null,
  scheduled_end             timestamptz not null,
  supersedes_instance_id    text,                 -- reschedule lineage (SOS-12)
  confirmed_by_customer     boolean not null default false,
  retained_after_review     boolean not null default false,  -- source "Calls" = retained bookings (SOS-01)
  -- Exact SOS-12 outcome enum, mirrored from AppointmentInstanceOutcome.
  outcome                   text not null check (outcome in (
                              'scheduled',
                              'canceled_before_cutoff',
                              'superseded_before_cutoff',
                              'late_canceled',
                              'attended',
                              'customer_no_show',
                              'rep_no_show',
                              'both_absent',
                              'technical_failure',
                              'unknown')),
  attendance_evidence_refs  text[] not null default '{}',
  attended_duration_seconds integer check (attended_duration_seconds is null or attended_duration_seconds >= 0),
  matured                   boolean not null default false, -- past end + grace + provider lag
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  primary key (tenant_id, instance_id),
  foreign key (tenant_id, appointment_id) references public.appointments(tenant_id, appointment_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, supersedes_instance_id) references public.appointment_instances(tenant_id, instance_id),
  constraint appointment_instances_window check (scheduled_end >= scheduled_start),
  constraint appointment_instances_no_self_supersede check (supersedes_instance_id is distinct from instance_id)
);

-- -----------------------------------------------------------------------------
-- Qualification and communication profile
-- -----------------------------------------------------------------------------

create table public.qualification_assessments (
  tenant_id           text not null references public.tenants(tenant_id),
  assessment_id       text not null,
  opportunity_id      text not null,
  policy_version      text not null,
  -- { [criterion]: { value: FitValue, evidenceRefs: [] } }; separate fields, not one magic score (SOS-13)
  objective           jsonb not null default '{}'::jsonb check (jsonb_typeof(objective) = 'object'),
  rep_perceived_fit   text not null check (rep_perceived_fit in ('likely','unlikely','unsure')),
  rep_reason          text,
  ai_recommendation   text check (ai_recommendation in ('proceed','clarify','decline')),
  review_state        text not null check (review_state in ('proposed','needs_confirmation','confirmed')),
  next_question       text,
  assessed_at         timestamptz not null,
  assessed_by_user_id text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (tenant_id, assessment_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, assessed_by_user_id) references public.users(tenant_id, user_id)
);

create table public.communication_profiles (
  tenant_id            text not null references public.tenants(tenant_id),
  profile_id           text not null,
  scope                text not null default 'opportunity_conversation' check (scope in ('opportunity_conversation')),
  opportunity_id       text not null,
  -- { value, source: "customer_selected" | "inferred" }
  preferred_language   jsonb check (preferred_language is null or jsonb_typeof(preferred_language) = 'object'),
  -- [{ text, evidenceRef }]
  explicit_preferences jsonb not null default '[]'::jsonb check (jsonb_typeof(explicit_preferences) = 'array'),
  -- [{ text, evidenceRef, confirmed }]
  observed_preferences jsonb not null default '[]'::jsonb check (jsonb_typeof(observed_preferences) = 'array'),
  -- [{ name: LensName, status, evidenceRefs, contradictingEvidenceRefs, humanConfirmed }] (SOS-07, SOS-08)
  lenses               jsonb not null default '[]'::jsonb check (jsonb_typeof(lenses) = 'array'),
  last_reviewed_at     timestamptz not null,
  review_due_at        timestamptz not null,
  policy_version       text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (tenant_id, profile_id),
  unique (tenant_id, opportunity_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id)
);

-- -----------------------------------------------------------------------------
-- Contracts, ledger, commissions (SOS-19)
-- -----------------------------------------------------------------------------

create table public.contracts (
  tenant_id      text not null references public.tenants(tenant_id),
  contract_id    text not null,
  opportunity_id text not null,
  offer_id       text not null,
  offer_version  text not null,
  value_minor    bigint not null check (value_minor >= 0),
  value_currency char(3) not null,
  state          text not null check (state in ('proposed','signed','canceled')),
  signed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, contract_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, offer_id) references public.offers(tenant_id, offer_id)
);

-- Reconciled money movements. Amount is a positive magnitude; kind determines sign.
-- One provider payment delivered three times produces one row (unique idempotency key).
-- An entry with no opportunity_id is an unlinked payment in the exception queue (SOS-19).
create table public.ledger_entries (
  tenant_id           text not null references public.tenants(tenant_id),
  entry_id            text not null,
  opportunity_id      text,
  contract_id         text,
  kind                text not null check (kind in ('payment_collected','refund','dispute_debit','dispute_credit','fee')),
  amount_minor        bigint not null check (amount_minor >= 0),
  currency            char(3) not null,
  provider_ref        text not null,
  idempotency_key     text not null,
  occurred_at         timestamptz not null,
  received_at         timestamptz not null,
  commercial_category text not null check (commercial_category in ('new_customer','expansion','recurring','referral','other')),
  pass_through        boolean not null default false,  -- excluded from commercial revenue basis
  created_at          timestamptz not null default now(),
  primary key (tenant_id, entry_id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, contract_id)
);

create table public.commission_policies (
  tenant_id      text not null references public.tenants(tenant_id),
  policy_version text not null,
  effective_from timestamptz not null,
  basis          text not null check (basis in ('reported_revenue','contracted_value','net_collected_cash')),
  rate_percent   numeric(7,4) not null check (rate_percent >= 0),
  hypothetical   boolean not null default true,  -- true until an actual agreement is supplied (D06)
  created_at     timestamptz not null default now(),
  primary key (tenant_id, policy_version)
);

create table public.commission_entries (
  tenant_id      text not null references public.tenants(tenant_id),
  entry_id       text not null,
  user_id        text not null,
  opportunity_id text not null,
  policy_version text not null,
  amount_minor   bigint not null,
  currency       char(3) not null,
  state          text not null check (state in ('calculated','accrued','pending_eligibility','payable','paid','disputed','adjusted')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, entry_id),
  foreign key (tenant_id, user_id) references public.users(tenant_id, user_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, policy_version) references public.commission_policies(tenant_id, policy_version)
);

-- -----------------------------------------------------------------------------
-- Domain events (append-only audit history, SOS-03)
-- -----------------------------------------------------------------------------

create table public.domain_events (
  tenant_id           text not null references public.tenants(tenant_id),
  event_id            text not null,
  event_type          text not null,
  schema_version      integer not null default 1,
  aggregate_type      text not null,
  aggregate_id        text not null,
  opportunity_id      text,
  occurred_at         timestamptz not null,
  received_at         timestamptz not null,
  actor_type          text not null check (actor_type in ('user','integration','ai','policy')),
  actor_id            text not null,
  source_system       text,
  source_event_id     text,
  idempotency_key     text not null,
  correlation_id      text,
  causation_id        text,
  evidence_refs       text[] not null default '{}',
  payload             jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  -- Adjustment events reference the original they correct; the original is never deleted.
  supersedes_event_id text,
  created_at          timestamptz not null default now(),
  primary key (tenant_id, event_id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, supersedes_event_id) references public.domain_events(tenant_id, event_id),
  constraint domain_events_no_self_supersede check (supersedes_event_id is distinct from event_id)
);

-- -----------------------------------------------------------------------------
-- Connector inbox (SOS-22 reliability model)
-- -----------------------------------------------------------------------------

-- Durable receipt of provider webhooks. Duplicated, delayed, and out-of-order
-- deliveries are expected; the unique tuple makes a redelivery a no-op.
create table public.provider_events (
  tenant_id           text not null references public.tenants(tenant_id),
  id                  uuid not null default gen_random_uuid(),
  provider            text not null,
  provider_account_id text not null,
  provider_event_id   text not null,
  event_type          text,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  status              text not null default 'pending' check (status in ('pending','processed','failed')),
  error               text,
  payload             jsonb not null default '{}'::jsonb,
  primary key (tenant_id, id),
  unique (tenant_id, provider, provider_account_id, provider_event_id),
  constraint provider_events_processed_pair check (
    (status = 'pending' and processed_at is null) or (status <> 'pending' and processed_at is not null)
  )
);

-- -----------------------------------------------------------------------------
-- Outbox / action leases (SOS-22 reliability model)
-- -----------------------------------------------------------------------------

-- Reliable external actions. A worker takes a lease before acting; stop-contact
-- and current-state checks happen at send time, not enqueue time. A timeout is
-- reconciled before retry; it is not assumed to be a failure.
create table public.outbox (
  tenant_id        text not null references public.tenants(tenant_id),
  id               uuid not null default gen_random_uuid(),
  action_type      text not null,
  aggregate_type   text,
  aggregate_id     text,
  opportunity_id   text,
  idempotency_key  text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'pending' check (status in ('pending','leased','succeeded','failed','dead')),
  lease_holder     text,
  lease_expires_at timestamptz,
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 5 check (max_attempts >= 1),
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, idempotency_key),
  constraint outbox_lease_pair check (
    (lease_holder is null and lease_expires_at is null)
    or (lease_holder is not null and lease_expires_at is not null)
  )
);

-- -----------------------------------------------------------------------------
-- Coaching (SOS-16). The LLM proposes; a policy function decides.
-- -----------------------------------------------------------------------------

create table public.coaching_recommendations (
  tenant_id                text not null references public.tenants(tenant_id),
  recommendation_id        text not null,
  owner_role               text not null check (owner_role in ('rep','marketing','sales_ops','product','finance','delivery')),
  owner_user_id            text,
  title                    text not null,
  issue                    text not null,
  metric_ids               text[] not null default '{}',
  cohort_id                text not null,
  data_state               text not null check (data_state in ('complete','partial','stale','unknown','insufficient_sample','immature','no_benchmark')),
  observed                 text not null,
  comparator               text not null,
  alternative_explanations text[] not null default '{}',
  evidence_refs            text[] not null default '{}',
  action                   text not null,
  playbook_version         text,
  effort                   text not null,
  -- CoachingScenario; modeledCash/modeledCommission as { amountMinor, currency }; disclaimer "Not a forecast"
  scenario                 jsonb check (scenario is null or jsonb_typeof(scenario) = 'object'),
  guardrails               text[] not null default '{}',
  review_at                timestamptz not null,
  state                    text not null check (state in ('proposed','accepted','in_practice','evaluated','adopted','rejected','inconclusive')),
  suppressed               jsonb check (suppressed is null or jsonb_typeof(suppressed) = 'object'),
  -- { engine: "rules" | "llm", version }. Model, prompt, and schema versions are recorded here.
  provenance               jsonb not null check (jsonb_typeof(provenance) = 'object' and provenance ? 'engine'),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  primary key (tenant_id, recommendation_id),
  foreign key (tenant_id, owner_user_id) references public.users(tenant_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Field authority registry (SOS-22 "Data ownership and writers", SOS-05)
-- -----------------------------------------------------------------------------

-- One declared operational writer per field. Example rows: a payment amount comes
-- from the payment ledger and a rep may dispute attribution but not edit it; a
-- calendar provider owns its event ids while the product owns appointment lineage.
create table public.field_authority_registry (
  tenant_id            text not null references public.tenants(tenant_id),
  field                text not null,                 -- e.g. "ledger_entries.amount_minor"
  authoritative_system text not null,                 -- e.g. "payment_provider", "crm", "sales_os"
  allowed_writers      text[] not null default '{}',  -- actor ids / systems permitted to write
  mapping              text,                          -- how the source maps to this field
  conflict_behavior    text not null check (conflict_behavior in ('authoritative_wins','newest_wins','manual_review','reject')),
  reconciliation_owner text,
  export_path          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (tenant_id, field)
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index lead_submissions_tenant_received_idx      on public.lead_submissions (tenant_id, received_at);
create index lead_submissions_tenant_contact_idx       on public.lead_submissions (tenant_id, contact_id);
create index opportunities_tenant_started_idx          on public.opportunities (tenant_id, accountability_started_at);
create index opportunities_tenant_status_idx           on public.opportunities (tenant_id, commercial_status);
create index assignments_tenant_opp_idx                on public.assignments (tenant_id, opportunity_id);
create index assignments_tenant_user_idx               on public.assignments (tenant_id, user_id, decided_at);
create index tasks_tenant_opp_idx                      on public.tasks (tenant_id, opportunity_id);
create index tasks_tenant_owner_state_idx              on public.tasks (tenant_id, owner_user_id, state);
create index tasks_tenant_due_idx                      on public.tasks (tenant_id, due_at);
create index tasks_tenant_lease_idx                    on public.tasks (tenant_id, lease_expires_at) where lease_expires_at is not null;
create index calls_tenant_opp_idx                      on public.calls (tenant_id, opportunity_id);
create index calls_tenant_started_idx                  on public.calls (tenant_id, started_at);
create index appointments_tenant_opp_idx               on public.appointments (tenant_id, opportunity_id);
create index appointment_instances_tenant_opp_idx      on public.appointment_instances (tenant_id, opportunity_id);
create index appointment_instances_tenant_start_idx    on public.appointment_instances (tenant_id, scheduled_start);
create index appointment_instances_tenant_appt_idx     on public.appointment_instances (tenant_id, appointment_id);
create index qualification_assessments_tenant_opp_idx  on public.qualification_assessments (tenant_id, opportunity_id);
create index contracts_tenant_opp_idx                  on public.contracts (tenant_id, opportunity_id);
create index ledger_entries_tenant_opp_idx             on public.ledger_entries (tenant_id, opportunity_id);
create index ledger_entries_tenant_occurred_idx        on public.ledger_entries (tenant_id, occurred_at);
create index ledger_entries_tenant_received_idx        on public.ledger_entries (tenant_id, received_at);
create index ledger_entries_unlinked_idx               on public.ledger_entries (tenant_id, received_at) where opportunity_id is null; -- exception queue
create index commission_entries_tenant_opp_idx         on public.commission_entries (tenant_id, opportunity_id);
create index commission_entries_tenant_user_idx        on public.commission_entries (tenant_id, user_id, state);
create index domain_events_tenant_opp_idx              on public.domain_events (tenant_id, opportunity_id);
create index domain_events_tenant_occurred_idx         on public.domain_events (tenant_id, occurred_at);
create index domain_events_tenant_received_idx         on public.domain_events (tenant_id, received_at);
create index domain_events_tenant_aggregate_idx        on public.domain_events (tenant_id, aggregate_type, aggregate_id);
create index provider_events_tenant_received_idx       on public.provider_events (tenant_id, received_at);
create index provider_events_pending_idx               on public.provider_events (tenant_id, received_at) where status = 'pending';
create index outbox_tenant_opp_idx                     on public.outbox (tenant_id, opportunity_id);
create index outbox_ready_idx                          on public.outbox (status, next_attempt_at) where status in ('pending','leased');
create index outbox_lease_idx                          on public.outbox (lease_expires_at) where lease_expires_at is not null;
create index coaching_recommendations_tenant_owner_idx on public.coaching_recommendations (tenant_id, owner_user_id, state);
create index coaching_recommendations_tenant_review_idx on public.coaching_recommendations (tenant_id, review_at);

-- -----------------------------------------------------------------------------
-- Atomic task lease (compare-and-set). Mirrors Repository.reserveTask / releaseTask.
-- -----------------------------------------------------------------------------

-- Returns true when the caller now holds the lease. Returns false when another
-- user holds a live lease, or the task is terminal. Renewal by the current
-- holder succeeds. `p_now` is passed in so callers and tests control time.
create or replace function public.reserve_task(
  p_tenant_id     text,
  p_task_id       text,
  p_user_id       text,
  p_lease_seconds integer,
  p_now           timestamptz
)
returns boolean
language plpgsql
as $$
declare
  v_rows integer;
begin
  update public.tasks
     set lease_holder_user_id = p_user_id,
         lease_expires_at     = p_now + make_interval(secs => p_lease_seconds),
         state                = case when state = 'unassigned' then 'reserved' else state end,
         updated_at           = p_now
   where tenant_id = p_tenant_id
     and task_id   = p_task_id
     and state not in ('completed','canceled')
     and (
       lease_holder_user_id is null
       or lease_holder_user_id = p_user_id
       or lease_expires_at <= p_now
     );
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- Returns true when the caller held the lease and it is now released.
create or replace function public.release_task(
  p_tenant_id text,
  p_task_id   text,
  p_user_id   text,
  p_now       timestamptz
)
returns boolean
language plpgsql
as $$
declare
  v_rows integer;
begin
  update public.tasks
     set lease_holder_user_id = null,
         lease_expires_at     = null,
         state                = case when state = 'reserved' then 'unassigned' else state end,
         updated_at           = p_now
   where tenant_id = p_tenant_id
     and task_id   = p_task_id
     and lease_holder_user_id = p_user_id;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security: every table, one tenant-isolation policy.
-- Tenant filters are enforced server-side (SOS-22): a frontend-hidden record is
-- not access control. current_setting('app.tenant_id', true) returns NULL when the
-- session has not called set_tenant(), and NULL never equals a tenant_id, so an
-- unscoped session sees and writes nothing.
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants','users','contacts','lead_submissions','offers','opportunities',
    'assignments','tasks','calls','appointments','appointment_instances',
    'qualification_assessments','communication_profiles','contracts',
    'ledger_entries','commission_policies','commission_entries','domain_events',
    'provider_events','outbox','coaching_recommendations','field_authority_registry'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I
         for all
         using (tenant_id = current_setting(''app.tenant_id'', true))
         with check (tenant_id = current_setting(''app.tenant_id'', true))',
      t
    );
  end loop;
end $$;

-- domain_events and ledger_entries are append-oriented: corrections are new rows
-- that reference the original (SOS-03). Deny update/delete to non-owner roles by
-- not granting them; the tenant_isolation policy above still gates select/insert.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke update, delete on public.domain_events, public.ledger_entries from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke update, delete on public.domain_events, public.ledger_entries from authenticated';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Optional read model: funnel counts per tenant and monthly accountability cohort.
--
-- Projections record their definition version and processing watermark so lag is
-- visible in the UI (SOS-03 "Query and reporting boundaries"). This is a plain
-- view, so its watermark is the query time; if it is later materialized, store
-- the refresh time as the watermark and bump definition_version on any change.
-- Rates are NOT computed here: the metric engine (src/domain/metrics.ts) owns
-- numerator/denominator/unknown semantics and returns MetricPayload, never a bare
-- number. DQ never leaves the assigned denominator (ARCHITECTURE invariant 7).
-- -----------------------------------------------------------------------------

create view public.v_funnel_counts as
with opp as (
  select o.tenant_id,
         o.opportunity_id,
         date_trunc('month', o.accountability_started_at) as cohort_month,
         o.contact_state,
         o.commercial_status,
         o.contract_state
    from public.opportunities o
),
inst as (
  select ai.tenant_id,
         ai.opportunity_id,
         bool_or(ai.retained_after_review)                              as any_retained,
         bool_or(ai.outcome = 'attended')                               as any_attended,
         bool_or(ai.outcome = 'unknown' and ai.matured)                 as any_unknown_matured
    from public.appointment_instances ai
   group by ai.tenant_id, ai.opportunity_id
)
select opp.tenant_id,
       opp.cohort_month,
       'v_funnel_counts:1'::text                                        as definition_version,
       now()                                                            as watermark,
       count(*)                                                         as assigned,
       count(*) filter (where opp.contact_state = 'two_way_contact')    as two_way_contact,
       count(*) filter (where opp.commercial_status = 'dq')             as dq,
       count(*) filter (where inst.any_retained)                        as retained_bookings,
       count(*) filter (where inst.any_attended)                        as attended,
       count(*) filter (where inst.any_unknown_matured)                 as attendance_unknown,
       count(*) filter (where opp.contract_state = 'signed')            as signed,
       count(*) filter (where opp.commercial_status = 'won')            as won
  from opp
  left join inst on inst.tenant_id = opp.tenant_id and inst.opportunity_id = opp.opportunity_id
 group by opp.tenant_id, opp.cohort_month;

comment on view public.v_funnel_counts is
  'Funnel stage counts per tenant and monthly accountability cohort. Records definition_version and watermark (SOS-03). Counts only; rates belong to the metric engine.';

commit;
