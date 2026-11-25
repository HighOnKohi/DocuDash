-- =============================================================================
-- DocuDash | 002_rls_policies.sql
-- Row-Level Security, role helpers, table privileges, and column-protection
-- triggers. Depends on 001_schema.sql.
--
-- Trust model used by the guard triggers below:
--   * current_user IN ('authenticated', 'anon')  -> request came from a client
--     through the Data API and is fully validated.
--   * any other current_user (service_role, postgres, or the owner of a
--     SECURITY DEFINER function such as book_pickup_slot) -> trusted server
--     code path; only system-managed fields are normalised.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so they can read profiles without recursing
-- into the profiles RLS policies). search_path is pinned to prevent hijacking.
-- -----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('staff', 'admin')
  );
$$;

comment on function public.is_staff() is 'True when the calling user has role staff or admin.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

comment on function public.is_admin() is 'True when the calling user has role admin.';

revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enable RLS on every table
-- -----------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.document_types      enable row level security;
alter table public.pickup_slots        enable row level security;
alter table public.requests            enable row level security;
alter table public.request_attachments enable row level security;
alter table public.audit_logs          enable row level security;

-- -----------------------------------------------------------------------------
-- Table privileges (defense in depth on top of RLS). Anonymous visitors get
-- nothing; authenticated users get only the verbs their policies can use.
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.document_types, public.pickup_slots,
              public.requests, public.request_attachments, public.audit_logs
  from anon, authenticated;

grant select, insert, update          on public.profiles            to authenticated;
grant select, insert, update, delete  on public.document_types      to authenticated;
grant select, insert, update, delete  on public.pickup_slots        to authenticated;
grant select, insert, update          on public.requests            to authenticated;
grant select, insert, delete          on public.request_attachments to authenticated;
grant select, insert                  on public.audit_logs          to authenticated;

grant all on public.profiles, public.document_types, public.pickup_slots,
             public.requests, public.request_attachments, public.audit_logs
  to service_role;

-- =============================================================================
-- profiles
-- =============================================================================
drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

-- Profiles are normally created by the on_auth_user_created trigger. This
-- policy is a fallback that only ever allows a self-owned resident profile.
drop policy if exists profiles_insert_own_resident on public.profiles;
create policy profiles_insert_own_resident on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'resident');

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- Column protection: residents (and staff) may edit their contact details only.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new; -- trusted server path
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.privacy_consent_at is distinct from old.privacy_consent_at then
    raise exception 'Profile identity and consent fields cannot be modified'
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

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- =============================================================================
-- document_types
-- =============================================================================
drop policy if exists document_types_select on public.document_types;
create policy document_types_select on public.document_types
  for select to authenticated
  using (is_active or (select public.is_staff()));

drop policy if exists document_types_admin_insert on public.document_types;
create policy document_types_admin_insert on public.document_types
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists document_types_admin_update on public.document_types;
create policy document_types_admin_update on public.document_types
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists document_types_admin_delete on public.document_types;
create policy document_types_admin_delete on public.document_types
  for delete to authenticated
  using ((select public.is_admin()));

-- =============================================================================
-- pickup_slots
-- =============================================================================
drop policy if exists pickup_slots_select on public.pickup_slots;
create policy pickup_slots_select on public.pickup_slots
  for select to authenticated
  using (true);

drop policy if exists pickup_slots_staff_insert on public.pickup_slots;
create policy pickup_slots_staff_insert on public.pickup_slots
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists pickup_slots_staff_update on public.pickup_slots;
create policy pickup_slots_staff_update on public.pickup_slots
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists pickup_slots_staff_delete_unbooked on public.pickup_slots;
create policy pickup_slots_staff_delete_unbooked on public.pickup_slots
  for delete to authenticated
  using ((select public.is_staff()) and booked_count = 0);

-- booked_count is owned by book_pickup_slot() and workflow triggers. Booked
-- slots cannot be moved to a different date/time under residents' feet.
create or replace function private.guard_pickup_slot_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new; -- trusted server path (SECURITY DEFINER RPC, service_role)
  end if;

  if tg_op = 'INSERT' then
    new.booked_count := 0;
    if new.slot_date < (now() at time zone 'Asia/Manila')::date then
      raise exception 'Pickup slots cannot be created in the past'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if new.booked_count is distinct from old.booked_count then
    raise exception 'booked_count is managed by the booking system'
      using errcode = '42501';
  end if;

  if old.booked_count > 0
     and (new.slot_date is distinct from old.slot_date or new.time_window is distinct from old.time_window) then
    raise exception 'Cannot move a slot that already has % booking(s); create a new slot instead', old.booked_count
      using errcode = '22023';
  end if;

  if new.max_capacity < old.booked_count then
    raise exception 'Capacity (%) cannot be lower than current bookings (%)', new.max_capacity, old.booked_count
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists pickup_slots_guard_write on public.pickup_slots;
create trigger pickup_slots_guard_write
  before insert or update on public.pickup_slots
  for each row execute function private.guard_pickup_slot_write();

-- =============================================================================
-- requests
-- =============================================================================
drop policy if exists requests_select_own_or_staff on public.requests;
create policy requests_select_own_or_staff on public.requests
  for select to authenticated
  using (resident_id = (select auth.uid()) or (select public.is_staff()));

-- Residents create their own requests in the initial state only, for an
-- active document type. Slot booking happens through book_pickup_slot().
drop policy if exists requests_insert_own_pending on public.requests;
create policy requests_insert_own_pending on public.requests
  for insert to authenticated
  with check (
    resident_id = (select auth.uid())
    and status = 'pending'
    and rejection_reason is null
    and pickup_slot_id is null
    and qr_token is null
    and reviewed_by is null
    and completed_at is null
    and exists (
      select 1 from public.document_types d
      where d.id = document_type_id and d.is_active
    )
  );

-- Residents may touch only their own pending requests (purpose edits, enforced
-- by trigger); staff may advance the workflow on any request.
drop policy if exists requests_update_own_pending_or_staff on public.requests;
create policy requests_update_own_pending_or_staff on public.requests
  for update to authenticated
  using ((resident_id = (select auth.uid()) and status = 'pending') or (select public.is_staff()))
  with check (resident_id = (select auth.uid()) or (select public.is_staff()));

-- No DELETE policy: requests are retained as records; residents cannot delete.

-- Column protection and workflow state machine.
create or replace function private.guard_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if current_user in ('authenticated', 'anon') then
    -- System-managed fields are never writable from the client.
    if new.id is distinct from old.id
       or new.resident_id is distinct from old.resident_id
       or new.created_at is distinct from old.created_at
       or new.qr_token is distinct from old.qr_token
       or new.pickup_slot_id is distinct from old.pickup_slot_id
       or new.completed_at is distinct from old.completed_at then
      raise exception 'These request fields are managed by the system'
        using errcode = '42501';
    end if;

    if not public.is_staff() then
      -- Residents: may only edit the purpose while the request is pending.
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

    -- Staff / admin.
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

    -- Allowed staff transitions. ready -> completed happens only through
    -- verify_pickup() (QR verification on the server).
    if not (
         (old.status = 'pending'   and new.status in ('reviewing', 'rejected'))
      or (old.status = 'reviewing' and new.status in ('ready', 'rejected'))
    ) then
      raise exception 'Invalid status transition from % to %', old.status, new.status
        using errcode = '22023';
    end if;

    new.reviewed_by := v_uid;
  end if;

  -- System-managed fields (all code paths).
  if new.status is distinct from old.status then
    if new.status = 'ready' then
      -- 256-bit CSPRNG token, base64url without padding (43 chars).
      new.qr_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
    end if;
    if new.status = 'completed' then
      new.completed_at := now();
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

drop trigger if exists requests_guard_update on public.requests;
create trigger requests_guard_update
  before update on public.requests
  for each row execute function private.guard_request_update();

-- =============================================================================
-- request_attachments
-- =============================================================================
drop policy if exists request_attachments_select_own_or_staff on public.request_attachments;
create policy request_attachments_select_own_or_staff on public.request_attachments
  for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.requests r
      where r.id = request_id and r.resident_id = (select auth.uid())
    )
  );

-- Residents attach files to their own pending requests only, at a path inside
-- their own folder, for a doc_type listed in the document's required_docs.
drop policy if exists request_attachments_insert_own_pending on public.request_attachments;
create policy request_attachments_insert_own_pending on public.request_attachments
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.requests r
      join public.document_types d on d.id = r.document_type_id
      where r.id = request_id
        and r.resident_id = (select auth.uid())
        and r.status = 'pending'
        and storage_path like ((select auth.uid())::text || '/' || r.id::text || '/%')
        and d.required_docs @> jsonb_build_array(jsonb_build_object('key', doc_type))
    )
  );

drop policy if exists request_attachments_delete_own_pending on public.request_attachments;
create policy request_attachments_delete_own_pending on public.request_attachments
  for delete to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_id
        and r.resident_id = (select auth.uid())
        and r.status = 'pending'
    )
  );

-- No UPDATE policy: attachments are immutable; replace by delete + insert.

-- =============================================================================
-- audit_logs (append-only; UPDATE/DELETE/TRUNCATE blocked by trigger in 001)
-- =============================================================================
drop policy if exists audit_logs_staff_select on public.audit_logs;
create policy audit_logs_staff_select on public.audit_logs
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists audit_logs_staff_insert on public.audit_logs;
create policy audit_logs_staff_insert on public.audit_logs
  for insert to authenticated
  with check ((select public.is_staff()) and actor_id = (select auth.uid()));

commit;
