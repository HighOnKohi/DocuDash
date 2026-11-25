-- =============================================================================
-- DocuDash | 001_schema.sql
-- Tables, enums, constraints, indexes, timestamp triggers, profile bootstrap,
-- Realtime publication, and seed data for barangay document types.
--
-- Run order: 001 -> 002 -> 003 -> 004. Each file is idempotent where practical.
-- Target: Supabase Postgres 15+ (auth schema provided by Supabase Auth).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
-- pgcrypto provides gen_random_bytes() for cryptographically secure QR tokens.
-- Supabase installs extensions into the dedicated "extensions" schema.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Internal schema for helpers that must never be exposed through the Data API
-- (PostgREST only exposes schemas listed in the API settings, i.e. "public").
create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'user_role' and n.nspname = 'public') then
    create type public.user_role as enum ('resident', 'staff', 'admin');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'request_status' and n.nspname = 'public') then
    create type public.request_status as enum ('pending', 'reviewing', 'ready', 'completed', 'rejected');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user. Created by the on_auth_user_created trigger.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null,
  address             text not null,
  contact_number      text not null,
  role                public.user_role not null default 'resident',
  -- RA 10173: explicit, timestamped consent is mandatory for every account.
  privacy_consent_at  timestamptz not null,
  created_at          timestamptz not null default now(),

  constraint profiles_full_name_length check (char_length(btrim(full_name)) between 2 and 120),
  constraint profiles_address_length check (char_length(btrim(address)) between 5 and 300),
  -- Philippine mobile (09XXXXXXXXX / +639XXXXXXXXX) or landline digits with optional separators.
  constraint profiles_contact_number_format check (contact_number ~ '^\+?[0-9][0-9 -]{6,18}[0-9]$'),
  constraint profiles_consent_not_future check (privacy_consent_at <= now() + interval '5 minutes')
);

comment on table public.profiles is 'Resident and staff profiles (1:1 with auth.users).';
comment on column public.profiles.privacy_consent_at is 'Timestamp of explicit Data Privacy Act (RA 10173) consent captured at registration.';

create index if not exists profiles_role_idx on public.profiles (role) where role <> 'resident';

-- -----------------------------------------------------------------------------
-- document_types: catalogue of barangay documents residents can request.
-- required_docs is a JSON array of { "key", "label", "description" } objects.
-- -----------------------------------------------------------------------------
create table if not exists public.document_types (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  description    text not null default '',
  fee            numeric(10, 2) not null default 0,
  required_docs  jsonb not null default '[]'::jsonb,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),

  constraint document_types_name_length check (char_length(btrim(name)) between 3 and 120),
  constraint document_types_fee_non_negative check (fee >= 0),
  constraint document_types_required_docs_array check (jsonb_typeof(required_docs) = 'array')
);

comment on table public.document_types is 'Barangay documents available for request.';
comment on column public.document_types.required_docs is 'JSON array: [{ "key": string, "label": string, "description": string }].';

-- -----------------------------------------------------------------------------
-- pickup_slots: bookable pickup windows with capacity.
-- time_window format: "HH:MM-HH:MM" (24h, Asia/Manila local time).
-- -----------------------------------------------------------------------------
create table if not exists public.pickup_slots (
  id            uuid primary key default gen_random_uuid(),
  slot_date     date not null,
  time_window   text not null,
  max_capacity  integer not null,
  booked_count  integer not null default 0,
  created_at    timestamptz not null default now(),

  constraint pickup_slots_time_window_format
    check (time_window ~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint pickup_slots_time_window_order
    check (split_part(time_window, '-', 1) < split_part(time_window, '-', 2)),
  constraint pickup_slots_max_capacity_positive check (max_capacity > 0 and max_capacity <= 500),
  constraint pickup_slots_booked_count_non_negative check (booked_count >= 0),
  constraint pickup_slots_booked_within_capacity check (booked_count <= max_capacity),
  constraint pickup_slots_unique_window unique (slot_date, time_window)
);

comment on table public.pickup_slots is 'Scheduled pickup windows. booked_count is maintained only by book_pickup_slot() and request workflow triggers.';

create index if not exists pickup_slots_slot_date_idx on public.pickup_slots (slot_date);

-- -----------------------------------------------------------------------------
-- requests: a resident's document request and its workflow state.
-- -----------------------------------------------------------------------------
create table if not exists public.requests (
  id                uuid primary key default gen_random_uuid(),
  resident_id       uuid not null references public.profiles (id) on delete cascade,
  document_type_id  uuid not null references public.document_types (id) on delete restrict,
  purpose           text not null,
  status            public.request_status not null default 'pending',
  rejection_reason  text,
  pickup_slot_id    uuid references public.pickup_slots (id) on delete restrict,
  qr_token          text unique,
  reviewed_by       uuid references public.profiles (id) on delete set null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint requests_purpose_length check (char_length(btrim(purpose)) between 3 and 500),
  -- A rejection must always be explained to the resident.
  constraint requests_rejection_reason_required
    check (status <> 'rejected' or (rejection_reason is not null and char_length(btrim(rejection_reason)) >= 3)),
  -- A QR pickup token exists exactly when the document is ready or has been released.
  constraint requests_qr_token_matches_status
    check ((status in ('ready', 'completed')) = (qr_token is not null)),
  constraint requests_qr_token_length check (qr_token is null or char_length(qr_token) >= 43),
  constraint requests_completed_at_matches_status
    check ((status = 'completed') = (completed_at is not null))
);

comment on table public.requests is 'Document requests submitted by residents.';
comment on column public.requests.qr_token is 'Cryptographically random pickup token generated server-side on transition to ready.';
comment on column public.requests.completed_at is 'Set when the document is released; drives the 30-day attachment retention purge.';

create index if not exists requests_resident_created_idx on public.requests (resident_id, created_at desc);
create index if not exists requests_status_created_idx on public.requests (status, created_at);
create index if not exists requests_pickup_slot_idx on public.requests (pickup_slot_id) where pickup_slot_id is not null;
create index if not exists requests_document_type_idx on public.requests (document_type_id);
create index if not exists requests_reviewed_by_idx on public.requests (reviewed_by) where reviewed_by is not null;
create index if not exists requests_completed_at_idx on public.requests (completed_at) where status = 'completed';

-- -----------------------------------------------------------------------------
-- request_attachments: metadata for files stored in the private "requirements"
-- bucket. storage_path convention: {user_id}/{request_id}/{filename}
-- -----------------------------------------------------------------------------
create table if not exists public.request_attachments (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.requests (id) on delete cascade,
  storage_path  text not null unique,
  doc_type      text not null,
  uploaded_at   timestamptz not null default now(),

  constraint request_attachments_doc_type_format check (doc_type ~ '^[a-z0-9_]{2,64}$'),
  constraint request_attachments_path_format
    check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$')
);

comment on table public.request_attachments is 'Uploaded requirement files (IDs, proofs). Purged 30 days after request completion (RA 10173).';

create index if not exists request_attachments_request_idx on public.request_attachments (request_id);

-- -----------------------------------------------------------------------------
-- audit_logs: append-only trail. No foreign keys so that history survives
-- deletion of the referenced rows and ON DELETE actions never need to UPDATE it.
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  request_id  uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  constraint audit_logs_action_format check (action ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint audit_logs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

comment on table public.audit_logs is 'Append-only audit trail. UPDATE, DELETE and TRUNCATE are rejected by trigger for every role.';

create index if not exists audit_logs_request_idx on public.audit_logs (request_id, created_at desc) where request_id is not null;
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc) where actor_id is not null;
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- -----------------------------------------------------------------------------
-- Generic triggers
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists requests_set_updated_at on public.requests;
create trigger requests_set_updated_at
  before update on public.requests
  for each row execute function private.set_updated_at();

-- Append-only enforcement for audit_logs (applies to every role, including
-- service_role and table owners, because triggers are not bypassed by RLS rules).
create or replace function private.reject_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only: % is not permitted', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists audit_logs_no_update_delete on public.audit_logs;
create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function private.reject_audit_log_mutation();

drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.reject_audit_log_mutation();

-- -----------------------------------------------------------------------------
-- Profile bootstrap: create a profile when Supabase Auth creates a user.
-- Registration must pass full_name, address, contact_number and
-- privacy_consent_at in options.data (raw_user_meta_data). The role is ALWAYS
-- 'resident' here; staff/admin roles are granted only by an admin.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_consent  timestamptz;
begin
  begin
    v_consent := nullif(v_meta ->> 'privacy_consent_at', '')::timestamptz;
  exception when others then
    v_consent := null;
  end;

  if v_consent is null then
    raise exception 'Data Privacy Act (RA 10173) consent is required to create an account'
      using errcode = '23514';
  end if;

  insert into public.profiles (id, full_name, address, contact_number, role, privacy_consent_at)
  values (
    new.id,
    btrim(coalesce(v_meta ->> 'full_name', '')),
    btrim(coalesce(v_meta ->> 'address', '')),
    btrim(coalesce(v_meta ->> 'contact_number', '')),
    'resident',
    least(v_consent, now())
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Realtime: stream request status and slot capacity changes. Supabase Realtime
-- applies RLS to postgres_changes, so residents only receive their own rows.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requests') then
      alter publication supabase_realtime add table public.requests;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pickup_slots') then
      alter publication supabase_realtime add table public.pickup_slots;
    end if;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Seed: barangay document types
-- -----------------------------------------------------------------------------
insert into public.document_types (name, description, fee, required_docs, is_active)
values
  (
    'Barangay Clearance',
    'Certifies that the resident has no derogatory record in the barangay. Commonly required for employment, loans, and government transactions.',
    50.00,
    '[
      {"key": "valid_id", "label": "Valid government-issued ID", "description": "Front side of a current ID showing your name and address (e.g. PhilSys, UMID, driver''s license, passport, voter''s ID)."},
      {"key": "community_tax_certificate", "label": "Community Tax Certificate (Cedula)", "description": "Current-year cedula issued by the barangay or city/municipal treasurer."}
    ]'::jsonb,
    true
  ),
  (
    'Certificate of Indigency',
    'Certifies that the resident belongs to a low-income household. Used for medical, legal, educational, and social welfare assistance.',
    0.00,
    '[
      {"key": "valid_id", "label": "Valid government-issued ID", "description": "Front side of a current ID showing your name and address."},
      {"key": "proof_of_need", "label": "Supporting document for the assistance sought", "description": "e.g. hospital bill, medical abstract, school assessment, or referral letter."}
    ]'::jsonb,
    true
  ),
  (
    'Certificate of Residency',
    'Certifies that the resident currently lives within the barangay and states the length of residence.',
    30.00,
    '[
      {"key": "valid_id", "label": "Valid government-issued ID", "description": "Front side of a current ID showing your name."},
      {"key": "proof_of_residency", "label": "Proof of residency", "description": "Recent utility bill, lease contract, or certification from the homeowner or purok leader."}
    ]'::jsonb,
    true
  ),
  (
    'Business Clearance',
    'Barangay clearance required to apply for or renew a Mayor''s / business permit for a business operating within the barangay.',
    300.00,
    '[
      {"key": "valid_id", "label": "Valid government-issued ID of the owner", "description": "Front side of a current ID of the business owner or authorized representative."},
      {"key": "business_registration", "label": "DTI / SEC / CDA registration", "description": "Certificate of business name registration or articles of incorporation."},
      {"key": "proof_of_location", "label": "Proof of business location", "description": "Lease contract, land title, or tax declaration for the business premises."}
    ]'::jsonb,
    true
  )
on conflict (name) do nothing;

commit;
