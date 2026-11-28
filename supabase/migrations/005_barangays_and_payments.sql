-- =============================================================================
-- DocuDash | 005_barangays_and_payments.sql
-- Adds multi-barangay auto-assignment + hall Google Maps info, barangay admin
-- onboarding requests, staff-uploaded GCash QR storage, and GCash/Cash payment
-- tracking + audited manual/digital verification.
-- Depends on 001_schema.sql through 004_storage.sql.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Payment enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'payment_method' and n.nspname = 'public'
  ) then
    create type public.payment_method as enum ('cash', 'gcash');
  end if;

  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'payment_timing' and n.nspname = 'public'
  ) then
    create type public.payment_timing as enum ('pay_now', 'pay_on_pickup');
  end if;

  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'payment_status' and n.nspname = 'public'
  ) then
    create type public.payment_status as enum ('unpaid', 'submitted', 'verified', 'rejected', 'waived');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. public.barangays
-- -----------------------------------------------------------------------------
create table if not exists public.barangays (
  id                     uuid primary key default gen_random_uuid(),
  psgc_code              text unique,
  name                   text not null,
  city_municipality      text not null,
  province               text not null default '',
  region                 text not null default '',
  hall_address           text not null default '',
  hall_latitude          double precision,
  hall_longitude         double precision,
  google_maps_url        text,
  gcash_qr_storage_path  text,
  gcash_account_name     text,
  gcash_account_number   text,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint barangays_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint barangays_city_length check (char_length(btrim(city_municipality)) between 2 and 120),
  constraint barangays_maps_url_format check (
    google_maps_url is null or google_maps_url ~* '^https?://'
  ),
  constraint barangays_lat_range check (
    hall_latitude is null or (hall_latitude >= -90 and hall_latitude <= 90)
  ),
  constraint barangays_lng_range check (
    hall_longitude is null or (hall_longitude >= -180 and hall_longitude <= 180)
  )
);

create unique index if not exists barangays_name_city_uidx
  on public.barangays (lower(btrim(name)), lower(btrim(city_municipality)));

drop trigger if exists barangays_set_updated_at on public.barangays;
create trigger barangays_set_updated_at
  before update on public.barangays
  for each row execute function private.set_updated_at();

alter table public.barangays enable row level security;

revoke all on public.barangays from anon, authenticated;
grant select, insert, update on public.barangays to authenticated;
grant all on public.barangays to service_role;

drop policy if exists barangays_select_authenticated on public.barangays;
create policy barangays_select_authenticated on public.barangays
  for select to authenticated
  using (true);

drop policy if exists barangays_staff_insert on public.barangays;
create policy barangays_staff_insert on public.barangays
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists barangays_staff_update on public.barangays;
create policy barangays_staff_update on public.barangays
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- -----------------------------------------------------------------------------
-- 3. public.barangay_admin_requests (written only via service_role API)
-- -----------------------------------------------------------------------------
create table if not exists public.barangay_admin_requests (
  id                  uuid primary key default gen_random_uuid(),
  psgc_code           text,
  barangay_name       text not null,
  city_municipality   text not null,
  province            text not null default '',
  region              text not null default '',
  hall_address        text not null default '',
  google_maps_url     text,
  applicant_name      text not null,
  applicant_position  text not null,
  applicant_email     text not null,
  contact_number      text not null,
  notes               text,
  status              text not null default 'pending',
  created_at          timestamptz not null default now(),

  constraint barangay_admin_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

alter table public.barangay_admin_requests enable row level security;
revoke all on public.barangay_admin_requests from anon, authenticated;
grant select on public.barangay_admin_requests to authenticated;
grant all on public.barangay_admin_requests to service_role;

drop policy if exists barangay_admin_requests_admin_select on public.barangay_admin_requests;
create policy barangay_admin_requests_admin_select on public.barangay_admin_requests
  for select to authenticated
  using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 4. Extend public.profiles with structured barangay assignment
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists barangay_id uuid references public.barangays (id) on delete set null,
  add column if not exists barangay_code text,
  add column if not exists barangay_name text,
  add column if not exists city_municipality text,
  add column if not exists province text,
  add column if not exists region text;

create index if not exists profiles_barangay_idx
  on public.profiles (barangay_id)
  where barangay_id is not null;

create or replace function private.resolve_or_create_barangay(
  p_psgc_code text,
  p_name text,
  p_city text,
  p_province text default '',
  p_region text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := nullif(btrim(coalesce(p_psgc_code, '')), '');
  v_name text := btrim(coalesce(p_name, ''));
  v_city text := btrim(coalesce(p_city, ''));
  v_prov text := btrim(coalesce(p_province, ''));
  v_reg  text := btrim(coalesce(p_region, ''));
  v_id   uuid;
begin
  if char_length(v_name) < 2 or char_length(v_city) < 2 then
    return null;
  end if;

  if v_code is not null then
    select b.id into v_id
    from public.barangays b
    where b.psgc_code = v_code
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select b.id into v_id
  from public.barangays b
  where lower(btrim(b.name)) = lower(v_name)
    and lower(btrim(b.city_municipality)) = lower(v_city)
  limit 1;

  if v_id is not null then
    if v_code is not null then
      update public.barangays
      set psgc_code = coalesce(psgc_code, v_code)
      where id = v_id;
    end if;
    return v_id;
  end if;

  insert into public.barangays (psgc_code, name, city_municipality, province, region)
  values (v_code, v_name, v_city, v_prov, v_reg)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    if v_code is not null then
      select b.id into v_id
      from public.barangays b
      where b.psgc_code = v_code
      limit 1;
    end if;

    if v_id is null then
      select b.id into v_id
      from public.barangays b
      where lower(btrim(b.name)) = lower(v_name)
        and lower(btrim(b.city_municipality)) = lower(v_city)
      limit 1;
    end if;
  end if;

  return v_id;
end;
$$;

-- Update auth user trigger to auto-assign barangay on registration.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta         jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_consent      timestamptz;
  v_brgy_code    text := nullif(btrim(coalesce(v_meta ->> 'barangay_code', '')), '');
  v_brgy_name    text := nullif(btrim(coalesce(v_meta ->> 'barangay_name', '')), '');
  v_city         text := nullif(btrim(coalesce(v_meta ->> 'city_municipality', '')), '');
  v_province     text := nullif(btrim(coalesce(v_meta ->> 'province', '')), '');
  v_region       text := nullif(btrim(coalesce(v_meta ->> 'region', '')), '');
  v_barangay_id  uuid;
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

  if v_brgy_name is not null and v_city is not null then
    v_barangay_id := private.resolve_or_create_barangay(
      v_brgy_code,
      v_brgy_name,
      v_city,
      coalesce(v_province, ''),
      coalesce(v_region, '')
    );
  end if;

  insert into public.profiles (
    id,
    full_name,
    address,
    contact_number,
    role,
    privacy_consent_at,
    barangay_id,
    barangay_code,
    barangay_name,
    city_municipality,
    province,
    region
  )
  values (
    new.id,
    btrim(coalesce(v_meta ->> 'full_name', '')),
    btrim(coalesce(v_meta ->> 'address', '')),
    btrim(coalesce(v_meta ->> 'contact_number', '')),
    'resident',
    least(v_consent, now()),
    v_barangay_id,
    v_brgy_code,
    v_brgy_name,
    v_city,
    v_province,
    v_region
  );

  return new;
end;
$$;

-- Guard direct updates to barangay_id unless admin or via assign_my_barangay() RPC.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.privacy_consent_at is distinct from old.privacy_consent_at then
    raise exception 'Profile identity and consent fields cannot be modified'
      using errcode = '42501';
  end if;

  if new.barangay_id is distinct from old.barangay_id and not public.is_admin() then
    raise exception 'Use assign_my_barangay() to update your assigned barangay'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Only administrators can change user roles'
        using errcode = '42501';
    end if;
    if old.id = (select auth.uid()) then
      raise exception 'Administrators cannot change their own role'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.assign_my_barangay(
  p_barangay_code text,
  p_barangay_name text,
  p_city_municipality text,
  p_province text default '',
  p_region text default ''
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_brgy_code    text := nullif(btrim(coalesce(p_barangay_code, '')), '');
  v_brgy_name    text := btrim(coalesce(p_barangay_name, ''));
  v_city         text := btrim(coalesce(p_city_municipality, ''));
  v_province     text := nullif(btrim(coalesce(p_province, '')), '');
  v_region       text := nullif(btrim(coalesce(p_region, '')), '');
  v_barangay_id  uuid;
  v_updated      public.profiles;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(v_brgy_name) < 2 or char_length(v_city) < 2 then
    raise exception 'Barangay name and city/municipality are required' using errcode = '22023';
  end if;

  v_barangay_id := private.resolve_or_create_barangay(
    v_brgy_code,
    v_brgy_name,
    v_city,
    coalesce(v_province, ''),
    coalesce(v_region, '')
  );

  update public.profiles
  set barangay_id       = v_barangay_id,
      barangay_code     = v_brgy_code,
      barangay_name     = v_brgy_name,
      city_municipality = v_city,
      province          = v_province,
      region            = v_region
  where id = v_uid
  returning * into v_updated;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  return v_updated;
end;
$$;

revoke all on function public.assign_my_barangay(text, text, text, text, text) from public, anon;
grant execute on function public.assign_my_barangay(text, text, text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Extend public.requests for barangay & payments (GCash / Cash only)
-- -----------------------------------------------------------------------------
alter table public.requests
  add column if not exists barangay_id          uuid references public.barangays (id) on delete set null,
  add column if not exists payment_method       public.payment_method not null default 'cash',
  add column if not exists payment_timing       public.payment_timing not null default 'pay_on_pickup',
  add column if not exists payment_status       public.payment_status not null default 'unpaid',
  add column if not exists payment_amount       numeric(10, 2) not null default 0,
  add column if not exists payment_reference    text,
  add column if not exists payment_proof_path   text,
  add column if not exists payment_notes        text,
  add column if not exists payment_verified_by  uuid references public.profiles (id) on delete set null,
  add column if not exists payment_verified_at  timestamptz;

create index if not exists requests_barangay_idx
  on public.requests (barangay_id)
  where barangay_id is not null;

create index if not exists requests_payment_status_idx
  on public.requests (payment_status, created_at desc);

-- Backfill fee & waived status on any pre-migration rows.
update public.requests r
set payment_amount = d.fee,
    payment_status = case
      when d.fee <= 0 then 'waived'::public.payment_status
      else r.payment_status
    end
from public.document_types d
where r.document_type_id = d.id
  and r.payment_amount = 0;

-- Automatically set barangay_id, document fee, and initial payment state on INSERT.
create or replace function private.init_request_payment_and_barangay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee          numeric(10, 2);
  v_barangay_id  uuid;
begin
  select p.barangay_id into v_barangay_id
  from public.profiles p
  where p.id = new.resident_id;

  select d.fee into v_fee
  from public.document_types d
  where d.id = new.document_type_id;

  new.barangay_id := coalesce(v_barangay_id, new.barangay_id);
  new.payment_amount := coalesce(v_fee, 0);

  if new.payment_amount <= 0 then
    new.payment_method := 'cash';
    new.payment_timing := 'pay_on_pickup';
    new.payment_status := 'waived';
  else
    if new.payment_method = 'cash' then
      new.payment_timing := 'pay_on_pickup';
    end if;
    new.payment_status := 'unpaid';
  end if;

  new.payment_reference := null;
  new.payment_proof_path := null;
  new.payment_notes := null;
  new.payment_verified_by := null;
  new.payment_verified_at := null;

  return new;
end;
$$;

drop trigger if exists requests_init_payment_and_barangay on public.requests;
create trigger requests_init_payment_and_barangay
  before insert on public.requests
  for each row execute function private.init_request_payment_and_barangay();

-- Prevent direct client UPDATE to barangay_id and payment_* fields (use audited RPCs).
create or replace function private.guard_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.resident_id is distinct from old.resident_id
       or new.created_at is distinct from old.created_at
       or new.qr_token is distinct from old.qr_token
       or new.pickup_slot_id is distinct from old.pickup_slot_id
       or new.completed_at is distinct from old.completed_at
       or new.barangay_id is distinct from old.barangay_id
       or new.payment_method is distinct from old.payment_method
       or new.payment_timing is distinct from old.payment_timing
       or new.payment_status is distinct from old.payment_status
       or new.payment_amount is distinct from old.payment_amount
       or new.payment_reference is distinct from old.payment_reference
       or new.payment_proof_path is distinct from old.payment_proof_path
       or new.payment_notes is distinct from old.payment_notes
       or new.payment_verified_by is distinct from old.payment_verified_by
       or new.payment_verified_at is distinct from old.payment_verified_at then
      raise exception 'These request fields are managed by the system'
        using errcode = '42501';
    end if;

    if not public.is_staff() then
      if old.status <> 'pending'
         or new.status is distinct from old.status
         or new.reviewed_by is distinct from old.reviewed_by
         or new.rejection_reason is distinct from old.rejection_reason
         or new.document_type_id is distinct from old.document_type_id then
        raise exception 'Residents may only edit the purpose of a pending request'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if old.resident_id = v_uid then
      raise exception 'Staff cannot process their own requests'
        using errcode = '42501';
    end if;

    if new.document_type_id is distinct from old.document_type_id
       or new.purpose is distinct from old.purpose then
      raise exception 'Resident-submitted details cannot be altered by staff'
        using errcode = '42501';
    end if;

    if new.status = old.status then
      if new.rejection_reason is distinct from old.rejection_reason
         or new.reviewed_by is distinct from old.reviewed_by then
        raise exception 'Request is already %; no workflow change requested', old.status
          using errcode = '22023';
      end if;
      return new;
    end if;

    if not (
         (old.status = 'pending'   and new.status in ('reviewing', 'rejected'))
      or (old.status = 'reviewing' and new.status in ('ready', 'rejected'))
    ) then
      raise exception 'Invalid status transition from % to %', old.status, new.status
        using errcode = '22023';
    end if;

    new.reviewed_by := v_uid;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'ready' then
      new.qr_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
    end if;
    if new.status = 'completed' then
      new.completed_at := now();
    end if;
    if new.status = 'rejected' then
      new.pickup_slot_id := null;
    end if;
  end if;

  if new.status not in ('ready', 'completed') then
    new.qr_token := null;
  end if;
  if new.status <> 'completed' then
    new.completed_at := null;
  end if;
  if new.status <> 'rejected' then
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

-- Audited RPC 1: Resident selects or switches Pay Now (GCash) vs Pay on Pickup (Cash / GCash).
create or replace function public.set_request_payment_option(
  p_request_id uuid,
  p_method     public.payment_method,
  p_timing     public.payment_timing
)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_req      public.requests%rowtype;
  v_updated  public.requests%rowtype;
  v_timing   public.payment_timing := p_timing;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_req
  from public.requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  if v_req.resident_id <> v_uid and not public.is_staff() then
    raise exception 'Not authorized to update payment options for this request'
      using errcode = '42501';
  end if;

  if v_req.status in ('completed', 'rejected') then
    raise exception 'Cannot update payment option on a % request', v_req.status
      using errcode = '22023';
  end if;

  if v_req.payment_status in ('verified', 'waived') then
    raise exception 'Payment is already finalized' using errcode = '22023';
  end if;

  if p_method = 'cash' then
    v_timing := 'pay_on_pickup';
  end if;

  update public.requests
  set payment_method = p_method,
      payment_timing = v_timing
  where id = p_request_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.set_request_payment_option(uuid, public.payment_method, public.payment_timing) from public, anon;
grant execute on function public.set_request_payment_option(uuid, public.payment_method, public.payment_timing) to authenticated, service_role;

-- Audited RPC 2: Resident submits digital GCash reference number + proof path.
create or replace function public.submit_gcash_payment(
  p_request_id       uuid,
  p_reference_number text,
  p_proof_path       text
)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_req      public.requests%rowtype;
  v_updated  public.requests%rowtype;
  v_ref      text := btrim(coalesce(p_reference_number, ''));
  v_path     text := btrim(coalesce(p_proof_path, ''));
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_req
  from public.requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  if v_req.resident_id <> v_uid then
    raise exception 'Only the requesting resident may submit payment proof'
      using errcode = '42501';
  end if;

  if v_req.status in ('completed', 'rejected') then
    raise exception 'Cannot submit payment for a % request', v_req.status
      using errcode = '22023';
  end if;

  if v_req.payment_amount <= 0 or v_req.payment_status = 'waived' then
    raise exception 'This document has no fee to pay' using errcode = '22023';
  end if;

  if v_req.payment_status = 'verified' then
    raise exception 'Payment has already been verified' using errcode = '22023';
  end if;

  if char_length(v_ref) < 6 or char_length(v_ref) > 64 then
    raise exception 'Please enter a valid GCash reference number (6 to 64 characters)'
      using errcode = '22023';
  end if;

  if v_path not like (v_uid::text || '/' || p_request_id::text || '/%') then
    raise exception 'Invalid payment proof storage path' using errcode = '22023';
  end if;

  update public.requests
  set payment_method      = 'gcash',
      payment_timing      = 'pay_now',
      payment_status      = 'submitted',
      payment_reference   = v_ref,
      payment_proof_path  = v_path,
      payment_notes       = null,
      payment_verified_by = null,
      payment_verified_at = null
  where id = p_request_id
  returning * into v_updated;

  insert into public.audit_logs (actor_id, action, request_id, metadata)
  values (
    v_uid,
    'payment_submitted',
    p_request_id,
    jsonb_build_object(
      'method', 'gcash',
      'amount', v_req.payment_amount,
      'reference', v_ref
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.submit_gcash_payment(uuid, text, text) from public, anon;
grant execute on function public.submit_gcash_payment(uuid, text, text) to authenticated, service_role;

-- Audited RPC 3: Staff/admin manually verifies Cash at counter or digitally verifies GCash proof.
create or replace function public.verify_request_payment(
  p_request_id uuid,
  p_decision   text,
  p_method     public.payment_method default null,
  p_reference  text default null,
  p_notes      text default null
)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_req       public.requests%rowtype;
  v_updated   public.requests%rowtype;
  v_decision  text := lower(btrim(coalesce(p_decision, '')));
  v_method    public.payment_method;
  v_ref       text := nullif(btrim(coalesce(p_reference, '')), '');
  v_notes     text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only barangay staff can verify payments' using errcode = '42501';
  end if;

  if v_decision not in ('verified', 'rejected') then
    raise exception 'Decision must be verified or rejected' using errcode = '22023';
  end if;

  select * into v_req
  from public.requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  if v_req.resident_id = v_uid then
    raise exception 'Staff cannot verify payments for their own requests'
      using errcode = '42501';
  end if;

  if v_req.status = 'rejected' then
    raise exception 'Cannot verify payment on a rejected request' using errcode = '22023';
  end if;

  if v_req.payment_amount <= 0 or v_req.payment_status = 'waived' then
    raise exception 'This document request does not require payment' using errcode = '22023';
  end if;

  v_method := coalesce(p_method, v_req.payment_method);

  if v_decision = 'rejected' then
    if v_notes is null or char_length(v_notes) < 3 then
      raise exception 'Please provide a reason for rejecting this payment proof'
        using errcode = '22023';
    end if;

    update public.requests
    set payment_status      = 'rejected',
        payment_notes       = v_notes,
        payment_verified_by = v_uid,
        payment_verified_at = now()
    where id = p_request_id
    returning * into v_updated;

    insert into public.audit_logs (actor_id, action, request_id, metadata)
    values (
      v_uid,
      'payment_rejected',
      p_request_id,
      jsonb_build_object('method', v_req.payment_method, 'notes', v_notes)
    );

    return v_updated;
  end if;

  update public.requests
  set payment_method      = v_method,
      payment_status      = 'verified',
      payment_reference   = coalesce(v_ref, payment_reference),
      payment_notes       = v_notes,
      payment_verified_by = v_uid,
      payment_verified_at = now()
  where id = p_request_id
  returning * into v_updated;

  insert into public.audit_logs (actor_id, action, request_id, metadata)
  values (
    v_uid,
    'payment_verified',
    p_request_id,
    jsonb_build_object(
      'method', v_method,
      'amount', v_req.payment_amount,
      'reference', coalesce(v_ref, v_req.payment_reference)
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.verify_request_payment(uuid, text, public.payment_method, text, text) from public, anon;
grant execute on function public.verify_request_payment(uuid, text, public.payment_method, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Storage: public "barangay-assets" QR bucket & GCash receipt uploads
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'barangay-assets',
  'barangay-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public             = true,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists barangay_assets_public_select on storage.objects;
create policy barangay_assets_public_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'barangay-assets');

drop policy if exists barangay_assets_staff_insert on storage.objects;
create policy barangay_assets_staff_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'barangay-assets'
    and (select public.is_staff())
  );

drop policy if exists barangay_assets_staff_delete on storage.objects;
create policy barangay_assets_staff_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'barangay-assets'
    and (select public.is_staff())
  );

-- Allow residents to also upload/replace GCash payment proofs (`payment-proof-*`)
-- inside `{user_id}/{request_id}/` even while request is reviewing/ready.
drop policy if exists requirements_resident_insert on storage.objects;
create policy requirements_resident_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'requirements'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.requests r
      where r.id::text = (storage.foldername(name))[2]
        and r.resident_id = (select auth.uid())
        and (
          r.status = 'pending'
          or (
            r.status in ('pending', 'reviewing', 'ready')
            and r.payment_status in ('unpaid', 'rejected')
            and split_part(name, '/', 3) like 'payment-proof-%'
          )
        )
    )
  );

drop policy if exists requirements_resident_delete on storage.objects;
create policy requirements_resident_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'requirements'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.requests r
      where r.id::text = (storage.foldername(name))[2]
        and r.resident_id = (select auth.uid())
        and (
          r.status = 'pending'
          or (
            r.status in ('pending', 'reviewing', 'ready')
            and r.payment_status in ('unpaid', 'rejected')
            and split_part(name, '/', 3) like 'payment-proof-%'
          )
        )
    )
  );

commit;
