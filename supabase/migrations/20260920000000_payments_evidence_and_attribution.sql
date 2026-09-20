-- =============================================================================
-- Payments: evidence classification, frozen attribution, and provider records
--
-- Governing intent:
--   OBAVIA_Simple_UX_and_Verified_Payment_Attribution_v2.md
--     section 7    the nine separate money concepts and the cash contract
--     section 15.2 the capability contract
--     section 15.3 the seven minimum shared records
--     section 15.4 tenant and account binding
--     section 17.5 delivery identity and economic-movement identity are separate
--   SOS-02 metric contracts, SOS-03 domain model, SOS-19 revenue and commissions
--
-- Mirrors src/domain/types.ts. That file is the contract; this file follows it.
--
-- STATUS: NOT applied to any project, and not to be applied without explicit
--         owner authorization (AGENTS.md rule 7; open decisions D04, D14).
--         Nothing in this file was executed against a database. Every claim it
--         makes is a claim about SQL text.
--
-- Conventions follow 20260918000000_sales_os_core.sql exactly: tenant_id on
-- every table, composite primary keys, money as amount_minor bigint plus
-- currency char(3), timestamptz everywhere, occurrence and receipt kept apart,
-- enumerations as check constraints so the next change is additive, and RLS
-- enabled and forced with one tenant-isolation policy per table.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. The nine money concepts
--
-- The previous five kinds collapsed four of the nine concepts of specification
-- section 7. Widened, not replaced: every existing kind keeps its meaning and
-- its sign. Only payment_collected, refund, dispute_debit and dispute_credit
-- move net collected cash. Everything else is a genuine record reported on its
-- own terms.
--
--   price_discussed            1. a price was discussed. Talk, never cash.
--   contracted_value           2. an approved agreement's value. A discount
--                                 reduces this and never reduces cash.
--   payment_authorized         3. authorized, no cash moved
--   payment_processing         3. in flight at the provider, no cash moved
--   payment_collected          4. the provider's confirmed success
--   refund                        confirmed money returned
--   dispute_opened                money at risk, no realized debit
--   dispute_debit                 a LOST dispute, debited exactly once
--   dispute_credit                a realized debit returned to the balance
--   dispute_closed_won            risk cleared, no money moved
--   fee                           processing cost, excluded and reported apart
--   processor_balance_credit   5. funds available in the processor balance
--   payout_to_bank             6. funds actually paid out to the bank
--   commission_accrued         7. accrued under the employer's policy
--   commission_payable         8. become payable
--   commission_paid            9. actually paid to the representative
-- -----------------------------------------------------------------------------

alter table public.ledger_entries
  drop constraint if exists ledger_entries_kind_check;

alter table public.ledger_entries
  add constraint ledger_entries_kind_check check (kind in (
    'price_discussed',
    'contracted_value',
    'payment_authorized',
    'payment_processing',
    'payment_collected',
    'refund',
    'dispute_opened',
    'dispute_debit',
    'dispute_credit',
    'dispute_closed_won',
    'fee',
    'processor_balance_credit',
    'payout_to_bank',
    'commission_accrued',
    'commission_payable',
    'commission_paid'
  ));

-- -----------------------------------------------------------------------------
-- 2. Evidence classification on every monetary movement
--
-- A movement must carry how it is known. Net collected cash counts
-- processor_confirmed only; the other classes stay genuine records and are
-- reported separately. A success redirect is not a payment, an invoice marked
-- paid outside the processor is not new cash, and a spreadsheet import is not
-- processor-confirmed collection.
-- -----------------------------------------------------------------------------

alter table public.ledger_entries
  add column if not exists evidence_class       text,
  add column if not exists provider             text,
  add column if not exists provider_account_id  text,
  add column if not exists environment          text not null default 'live',
  add column if not exists provider_movement_id text,
  add column if not exists order_id             text,
  add column if not exists attribution_snapshot_id text;

alter table public.ledger_entries
  add constraint ledger_entries_evidence_class_check check (
    evidence_class in (
      'processor_confirmed',   -- the processor's own authoritative state
      'provider_reported',     -- a connected platform's view, not the processor
      'manually_marked_paid',  -- marked paid outside the processor, zero balance, credit
      'externally_recorded',   -- wire, check, cash, recorded by a person
      'imported_record'        -- a spreadsheet or CRM import
    )
  );

alter table public.ledger_entries
  add constraint ledger_entries_environment_check check (environment in ('live', 'test'));

-- Every movement written from here on states how it is known. The column is
-- left nullable ONLY so that this migration can run against a table that
-- already holds rows: those rows predate the class and must be classified by
-- their writer, not blessed by a default. On a database where ledger_entries is
-- empty (the current state: nothing in this directory has ever been applied),
-- enforce it immediately by uncommenting the line below. Recorded as an open
-- decision rather than silently defaulted.
--
--   alter table public.ledger_entries alter column evidence_class set not null;

-- Uniqueness on ECONOMIC MOVEMENT identity, separate from the existing
-- uniqueness on delivery identity (tenant_id, idempotency_key).
--
-- A checkout event, a payment-intent event and an invoice event can each
-- describe one payment: three deliveries, one movement, one row. Provider,
-- account and environment are part of the key because an external payment id
-- alone is not a global namespace (specification 15.4), and because a test
-- movement must never collide with a live one.
--
-- kind is part of the index for the same reason it is part of the posting key
-- in src/domain/events.ts: a charge and its processing fee can share one
-- provider movement id and are two different economic facts.
create unique index if not exists ledger_entries_movement_identity_uniq
  on public.ledger_entries (tenant_id, provider, provider_account_id, environment, provider_movement_id, kind)
  where provider_movement_id is not null;

comment on column public.ledger_entries.evidence_class is
  'How this movement is known. Only processor_confirmed counts as net collected cash (spec 7, scenarios 16 and 60).';
comment on column public.ledger_entries.provider_movement_id is
  'The provider identifier of the MOVEMENT, not of the delivery. Shared by every event describing one payment (spec 17.5).';
comment on column public.ledger_entries.environment is
  'live or test. A test movement changes no standing, commission or XP (scenarios 13 and 62).';

-- -----------------------------------------------------------------------------
-- 3. Processing is a state of its own
--
-- A payment can finish checkout before it succeeds. A customer saying "I paid"
-- while the provider is still working renders as Processing and never as
-- Collected (scenario 2).
-- -----------------------------------------------------------------------------

alter table public.opportunities
  drop constraint if exists opportunities_payment_state_check;

alter table public.opportunities
  add constraint opportunities_payment_state_check check (payment_state in (
    'none', 'authorized', 'processing', 'partially_collected', 'collected', 'refunded', 'disputed'
  ));

-- -----------------------------------------------------------------------------
-- 4. Event receipts learn about occurrence, environment, and retries
--
-- Additive to the existing provider_events inbox, whose unique tuple
-- (tenant_id, provider, provider_account_id, provider_event_id) already makes a
-- redelivery a no-op.
-- -----------------------------------------------------------------------------

alter table public.provider_events
  add column if not exists occurred_at  timestamptz,
  add column if not exists environment  text not null default 'live',
  add column if not exists attempts     integer not null default 0,
  add column if not exists payload_ref  text;

alter table public.provider_events
  add constraint provider_events_environment_check check (environment in ('live', 'test'));

alter table public.provider_events
  add constraint provider_events_attempts_check check (attempts >= 0);

comment on column public.provider_events.payload_ref is
  'Reference to a protected payload in the vault when the raw body must not be stored inline. Never a secret itself.';

-- -----------------------------------------------------------------------------
-- 5. Orders and their installment schedules
--
-- The person and company are identity records, the opportunity is the sales
-- effort, and the order is the specific purchased agreement. A later upsell is
-- a new order with its own credit, never an extension of the first closer's.
-- -----------------------------------------------------------------------------

create table public.orders (
  tenant_id               text not null references public.tenants(tenant_id),
  order_id                text not null,
  opportunity_id          text not null,
  offer_id                text not null,
  offer_version           text not null,
  contract_id             text,
  -- The approved value of the agreement. A discount reduces this figure and
  -- nothing else; collected cash is whatever the processor confirms.
  contracted_value_minor  bigint not null check (contracted_value_minor >= 0),
  currency                char(3) not null,
  discount_minor          bigint check (discount_minor >= 0),
  discount_reason         text,
  discount_approved_by    text,
  state                   text not null check (state in ('draft','approved','issued_for_payment','fulfilled','canceled')),
  -- Set once. This is the attribution seal point (proposed default).
  issued_for_payment_at   timestamptz,
  attribution_snapshot_id text,
  created_by_user_id      text not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (tenant_id, order_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, offer_id) references public.offers(tenant_id, offer_id),
  foreign key (tenant_id, contract_id) references public.contracts(tenant_id, contract_id),
  constraint orders_discount_pair check (
    (discount_minor is null and discount_reason is null and discount_approved_by is null)
    or (discount_minor is not null and discount_reason is not null and discount_approved_by is not null)
  ),
  -- An order that has been issued for payment carries the moment it was issued,
  -- because that moment is the attribution seal point. A canceled order may have
  -- been canceled from either side of the seal.
  constraint orders_issued_pair check (
    (state in ('draft','approved') and issued_for_payment_at is null)
    or (state in ('issued_for_payment','fulfilled') and issued_for_payment_at is not null)
    or state = 'canceled'
  )
);

create table public.order_installments (
  tenant_id          text not null references public.tenants(tenant_id),
  installment_id     text not null,
  order_id           text not null,
  sequence           integer not null check (sequence >= 1),
  due_at             timestamptz not null,
  amount_minor       bigint not null check (amount_minor >= 0),
  currency           char(3) not null,
  state              text not null check (state in ('scheduled','requested','collected','failed','canceled')),
  payment_request_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (tenant_id, installment_id),
  unique (tenant_id, order_id, sequence),
  foreign key (tenant_id, order_id) references public.orders(tenant_id, order_id)
);

-- -----------------------------------------------------------------------------
-- 6. Attribution snapshots: frozen credit
--
-- Money reads point here, never at opportunities.current_owner, so reassigning a
-- contact tomorrow cannot move yesterday's commission. Identities come from
-- authenticated assignments and accepted handoffs: sending the payment link is
-- not proof of being the closer.
-- -----------------------------------------------------------------------------

create table public.attribution_snapshots (
  tenant_id                  text not null references public.tenants(tenant_id),
  snapshot_id                text not null,
  order_id                   text not null,
  opportunity_id             text not null,
  setter_user_id             text,
  closer_user_id             text,
  pair_id                    text,
  commission_policy_version  text not null,
  freeze_point               text not null check (freeze_point in (
    'handoff_accepted', 'order_issued_for_payment', 'authorized_correction'
  )),
  frozen_at                  timestamptz not null,
  -- True when no representative could be established from evidence. The
  -- collection is still genuine; the credit stays unallocated until policy or
  -- evidence resolves it (scenario 45).
  unallocated                boolean not null default false,
  created_at                 timestamptz not null default now(),
  primary key (tenant_id, snapshot_id),
  -- One sealed snapshot per order. A second sale gets a second order.
  unique (tenant_id, order_id),
  foreign key (tenant_id, order_id) references public.orders(tenant_id, order_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id)
);

-- Append-only. An authorized correction is added as a row; the sealed snapshot
-- above is never edited in place. A representative may never authorize a
-- correction to their own credit: that rule is enforced in the server policy,
-- and this table records who did authorize it.
create table public.attribution_corrections (
  tenant_id           text not null references public.tenants(tenant_id),
  correction_id       text not null,
  snapshot_id         text not null,
  applied_at          timestamptz not null,
  authorized_by_user_id text not null,
  authorizer_role     text not null check (authorizer_role in ('setter','closer','owner','manager','delivery')),
  -- The predetermined exception rule applied, defined once at onboarding.
  rule                text not null,
  reason              text not null,
  previous_setter_user_id text,
  previous_closer_user_id text,
  previous_pair_id    text,
  next_setter_user_id text,
  next_closer_user_id text,
  next_pair_id        text,
  evidence_refs       text[] not null default '{}',
  created_at          timestamptz not null default now(),
  primary key (tenant_id, correction_id),
  foreign key (tenant_id, snapshot_id) references public.attribution_snapshots(tenant_id, snapshot_id)
);

alter table public.orders
  add constraint orders_attribution_snapshot_fk
  foreign key (tenant_id, attribution_snapshot_id)
  references public.attribution_snapshots(tenant_id, snapshot_id)
  deferrable initially deferred;

alter table public.ledger_entries
  add constraint ledger_entries_order_fk
  foreign key (tenant_id, order_id) references public.orders(tenant_id, order_id);

alter table public.ledger_entries
  add constraint ledger_entries_attribution_snapshot_fk
  foreign key (tenant_id, attribution_snapshot_id)
  references public.attribution_snapshots(tenant_id, snapshot_id);

-- -----------------------------------------------------------------------------
-- 7. Provider connections and the capability contract
--
-- Requested scopes and granted scopes are separate columns because they are
-- separate facts. Capabilities are displayed from evidence, never from the
-- presence of a provider logo. There is deliberately no connected boolean.
-- -----------------------------------------------------------------------------

create table public.provider_connections (
  tenant_id             text not null references public.tenants(tenant_id),
  connection_id         text not null,
  provider              text not null,
  authorization_method  text not null check (authorization_method in (
    'oauth_authorization_code',
    'app_installation',
    'partner_enablement_client_credentials',
    'assisted_restricted_key',
    'none'
  )),
  -- The bound merchant account. Reads and writes are always scoped by it.
  provider_account_id   text not null,
  account_label         text,
  environment           text not null check (environment in ('live','test')),
  -- Reference to a secret in the vault. Never the secret itself, never a token,
  -- never in a settings field, a model prompt, or a log.
  secret_ref            text,
  requested_scopes      text[] not null default '{}',
  granted_scopes        text[] not null default '{}',
  -- The specification 15.2 capability contract. Per-item values are verified,
  -- pending_verification, not_requested, not_authorized, requires_setup, or
  -- unsupported. Shape is validated in the domain layer, not here, so that a
  -- new capability is a code change and not a schema rewrite.
  capabilities          jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  implementation_state  text not null check (implementation_state in (
    'absent','sandbox_only','blocked_by_provider_access','awaiting_publication','live'
  )),
  api_version           text,
  authorized_by_user_id text not null,
  authorization_state   text not null check (authorization_state in (
    'none','pending','granted','revoked','reconnect_required'
  )),
  granted_at            timestamptz,
  expires_at            timestamptz,
  last_verified_at      timestamptz,
  revoked_at            timestamptz,
  binding_conflict_reason text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (tenant_id, connection_id),
  -- Reauthorizing the same merchant in one workspace updates that connection
  -- rather than starting a second additive ledger (scenario 46).
  unique (tenant_id, provider, provider_account_id, environment)
);

-- One merchant account is bound to one workspace. A second workspace attempting
-- to connect an already-bound merchant is rejected with an explicit reason and
-- never resolved by matching an email address (specification 15.4, scenario 47).
-- Sharing one merchant across workspaces needs a reviewed allocation model,
-- which does not exist yet; until it does, this index is the refusal.
create unique index if not exists provider_connections_merchant_binding_uniq
  on public.provider_connections (provider, provider_account_id, environment)
  where authorization_state in ('pending', 'granted');

comment on index public.provider_connections_merchant_binding_uniq is
  'One live binding per merchant account across all workspaces. A second workspace is rejected with a reason, not merged (scenario 47).';

-- An account-scoped and environment-scoped external object id connected to an
-- internal identity. Prefer linking before payment over matching after payment.
create table public.provider_object_links (
  tenant_id            text not null references public.tenants(tenant_id),
  link_id              text not null,
  provider             text not null,
  provider_account_id  text not null,
  environment          text not null check (environment in ('live','test')),
  provider_object_type text not null check (provider_object_type in (
    'payment','refund','dispute','payout','invoice','checkout_session','subscription','customer','other'
  )),
  provider_object_id   text not null,
  internal_kind        text not null check (internal_kind in (
    'order','opportunity','payment_request','contact','ledger_entry'
  )),
  internal_id          text not null,
  -- The preferred mapping order of specification 17.1. A candidate never
  -- finalizes commission-bearing attribution on its own.
  confidence           text not null check (confidence in (
    'authoritative_reference','confirmed_mapping','candidate'
  )),
  linked_at            timestamptz not null,
  confirmed_by_user_id text,
  note                 text,
  created_at           timestamptz not null default now(),
  primary key (tenant_id, link_id),
  unique (tenant_id, provider, provider_account_id, environment, provider_object_type, provider_object_id)
);

-- Resumable coverage per resource per connection. Coverage that actually loaded
-- is recorded, so partial history is disclosed at the metric instead of being
-- presented as complete (scenario 59).
create table public.sync_checkpoints (
  tenant_id             text not null references public.tenants(tenant_id),
  checkpoint_id         text not null,
  connection_id         text not null,
  provider              text not null,
  provider_account_id   text not null,
  environment           text not null check (environment in ('live','test')),
  resource              text not null check (resource in ('payments','refunds','disputes','payouts','subscriptions')),
  -- Provider pagination cursor. Opaque. Named cursor_token so the column never
  -- collides with the CURSOR keyword in a hand-written query.
  cursor_token          text,
  -- Proposed default 90 days, owner-overridable (specification 17.2).
  requested_window_days integer not null default 90 check (requested_window_days >= 0),
  coverage_start        timestamptz,
  coverage_end          timestamptz,
  last_success_at       timestamptz,
  event_freshness_at    timestamptz,
  state                 text not null check (state in ('never_run','importing','reconciling','current','limited','failed')),
  limitation            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (tenant_id, checkpoint_id),
  unique (tenant_id, connection_id, resource),
  foreign key (tenant_id, connection_id) references public.provider_connections(tenant_id, connection_id)
);

-- -----------------------------------------------------------------------------
-- 8. Payment requests (Level B, separately authorized)
--
-- Creating one requires a granted collection permission. It is never unlimited
-- charging authority, and the person who pressed send never becomes the
-- credited closer (scenario 8).
-- -----------------------------------------------------------------------------

create table public.payment_requests (
  tenant_id               text not null references public.tenants(tenant_id),
  payment_request_id      text not null,
  order_id                text not null,
  opportunity_id          text not null,
  installment_id          text,
  -- Bound before the request is sent, so credit exists before money arrives.
  attribution_snapshot_id text not null,
  amount_minor            bigint not null check (amount_minor >= 0),
  currency                char(3) not null,
  provider                text not null,
  provider_account_id     text not null,
  environment             text not null check (environment in ('live','test')),
  provider_object_id      text,
  -- The key sent to the provider, so a retry after an uncertain timeout
  -- resolves the original request instead of issuing a second one.
  idempotency_key         text not null,
  state                   text not null check (state in (
    'draft','requested','sent','paid','failed','canceled',
    -- The outcome could not be established. Blocks retry. Never assumed to be
    -- a failure (scenario 58).
    'unresolved'
  )),
  requested_by_user_id    text not null,
  requested_at            timestamptz not null,
  sent_at                 timestamptz,
  last_outcome_kind       text check (last_outcome_kind in ('succeeded','failed','unresolved')),
  last_outcome_reason     text,
  last_outcome_at         timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (tenant_id, payment_request_id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, order_id) references public.orders(tenant_id, order_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, opportunity_id),
  foreign key (tenant_id, installment_id) references public.order_installments(tenant_id, installment_id),
  foreign key (tenant_id, attribution_snapshot_id) references public.attribution_snapshots(tenant_id, snapshot_id)
);

comment on column public.payment_requests.requested_by_user_id is
  'Who pressed send. An operations employee may send on a closer behalf; this column never determines credit (scenario 8).';

-- -----------------------------------------------------------------------------
-- 9. Payment exceptions
--
-- The operations work item behind a scoped incident: an owner, a reason, and an
-- append-only resolution history. One record needing reconciliation never
-- pauses unrelated selling.
-- -----------------------------------------------------------------------------

create table public.payment_exceptions (
  tenant_id          text not null references public.tenants(tenant_id),
  exception_id       text not null,
  kind               text not null check (kind in (
    'unlinked_payment',
    'ambiguous_order_match',
    'unbound_account',
    'amount_mismatch',
    'unresolved_payment_request',
    'duplicate_movement_candidate',
    'coverage_gap',
    'unclassified_evidence'
  )),
  severity           text not null check (severity in ('info','warning','critical')),
  title              text not null,
  -- Only these surfaces are affected. Everything else keeps running.
  affected_surfaces  text[] not null default '{}',
  subjects           jsonb not null default '{}'::jsonb check (jsonb_typeof(subjects) = 'object'),
  assigned_to_user_id text,
  owner_role         text not null,
  reason             text not null,
  opened_at          timestamptz not null,
  state              text not null check (state in ('open','resolved','wont_fix')),
  resolved_at        timestamptz,
  resolved_by_user_id text,
  resolution_action  text,
  resolution_note    text,
  evidence_refs      text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (tenant_id, exception_id),
  constraint payment_exceptions_resolution_pair check (
    (state = 'open' and resolved_at is null)
    or (state <> 'open' and resolved_at is not null)
  )
);

create table public.payment_exception_events (
  tenant_id     text not null references public.tenants(tenant_id),
  id            uuid not null default gen_random_uuid(),
  exception_id  text not null,
  occurred_at   timestamptz not null,
  by_user_id    text,
  action        text not null,
  note          text not null default '',
  primary key (tenant_id, id),
  foreign key (tenant_id, exception_id) references public.payment_exceptions(tenant_id, exception_id)
);

-- -----------------------------------------------------------------------------
-- 10. Row Level Security on every new table
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'orders','order_installments','attribution_snapshots','attribution_corrections',
    'provider_connections','provider_object_links','sync_checkpoints',
    'payment_requests','payment_exceptions','payment_exception_events'
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

-- Attribution snapshots and their corrections are append-oriented: a correction
-- is a new row that copies the values it replaces. Deny update and delete to
-- non-owner roles by not granting them.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke update, delete on public.attribution_snapshots, public.attribution_corrections, public.payment_exception_events from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke update, delete on public.attribution_snapshots, public.attribution_corrections, public.payment_exception_events from authenticated';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 11. Indexes for the reads this subsystem actually performs
-- -----------------------------------------------------------------------------

create index if not exists ledger_entries_order_idx on public.ledger_entries (tenant_id, order_id);
create index if not exists ledger_entries_snapshot_idx on public.ledger_entries (tenant_id, attribution_snapshot_id);
create index if not exists ledger_entries_evidence_idx on public.ledger_entries (tenant_id, evidence_class, environment);
create index if not exists orders_opportunity_idx on public.orders (tenant_id, opportunity_id);
create index if not exists order_installments_order_idx on public.order_installments (tenant_id, order_id, sequence);
create index if not exists attribution_snapshots_opportunity_idx on public.attribution_snapshots (tenant_id, opportunity_id);
create index if not exists provider_object_links_internal_idx on public.provider_object_links (tenant_id, internal_kind, internal_id);
create index if not exists payment_requests_order_idx on public.payment_requests (tenant_id, order_id);
create index if not exists payment_exceptions_open_idx on public.payment_exceptions (tenant_id, state, opened_at);

commit;
