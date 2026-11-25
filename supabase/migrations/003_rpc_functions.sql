-- =============================================================================
-- DocuDash | 003_rpc_functions.sql
-- Atomic slot booking (with FOR UPDATE row locking), automatic slot release on
-- rejection, server-only atomic QR pickup verification, and RA 10173 30-day
-- attachment retention purge helper.
-- Depends on 001_schema.sql and 002_rls_policies.sql.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- book_pickup_slot(p_request_id, p_slot_id)
-- Atomically assigns (or re-assigns) a pickup slot to a request using row-level
-- FOR UPDATE locks so concurrent bookings can never exceed max_capacity.
-- -----------------------------------------------------------------------------
create or replace function public.book_pickup_slot(
  p_request_id uuid,
  p_slot_id    uuid
)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_request       public.requests%rowtype;
  v_old_slot_id   uuid;
  v_target_slot   public.pickup_slots%rowtype;
  v_updated       public.requests%rowtype;
  v_today_manila  date := (now() at time zone 'Asia/Manila')::date;
begin
  if v_uid is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  -- Lock the request row first to serialize concurrent booking attempts for the same request.
  select *
  into v_request
  from public.requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found'
      using errcode = 'P0002';
  end if;

  if v_request.resident_id <> v_uid and not public.is_staff() then
    raise exception 'Not authorized to book a slot for this request'
      using errcode = '42501';
  end if;

  if v_request.status in ('completed', 'rejected') then
    raise exception 'Cannot book a pickup slot for a % request', v_request.status
      using errcode = '22023';
  end if;

  v_old_slot_id := v_request.pickup_slot_id;

  -- Idempotent no-op if the request is already assigned to this slot.
  if v_old_slot_id = p_slot_id then
    return v_request;
  end if;

  -- Lock involved pickup_slots rows in deterministic UUID order to prevent deadlocks
  -- when two requests swap between the same pair of slots simultaneously.
  if v_old_slot_id is not null then
    perform 1
    from public.pickup_slots
    where id in (v_old_slot_id, p_slot_id)
    order by id
    for update;
  else
    perform 1
    from public.pickup_slots
    where id = p_slot_id
    for update;
  end if;

  select *
  into v_target_slot
  from public.pickup_slots
  where id = p_slot_id;

  if not found then
    raise exception 'Pickup slot not found'
      using errcode = 'P0002';
  end if;

  if v_target_slot.slot_date < v_today_manila then
    raise exception 'Cannot book a pickup slot in the past'
      using errcode = '22023';
  end if;

  if v_target_slot.booked_count >= v_target_slot.max_capacity then
    raise exception 'Selected pickup slot is already full'
      using errcode = '22023';
  end if;

  -- Release previous slot capacity if re-booking.
  if v_old_slot_id is not null then
    update public.pickup_slots
    set booked_count = greatest(booked_count - 1, 0)
    where id = v_old_slot_id;
  end if;

  -- Reserve capacity in the target slot.
  update public.pickup_slots
  set booked_count = booked_count + 1
  where id = p_slot_id;

  update public.requests
  set pickup_slot_id = p_slot_id
  where id = p_request_id
  returning * into v_updated;

  insert into public.audit_logs (actor_id, action, request_id, metadata)
  values (
    v_uid,
    case when v_old_slot_id is null then 'slot_booked' else 'slot_rebooked' end,
    p_request_id,
    jsonb_build_object(
      'previous_slot_id', v_old_slot_id,
      'slot_id', p_slot_id,
      'slot_date', v_target_slot.slot_date,
      'time_window', v_target_slot.time_window
    )
  );

  return v_updated;
end;
$$;

comment on function public.book_pickup_slot(uuid, uuid) is 'Atomically books or re-books a pickup slot with FOR UPDATE locking to prevent overbooking.';

revoke all on function public.book_pickup_slot(uuid, uuid) from public, anon;
grant execute on function public.book_pickup_slot(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Automatically release a booked pickup slot when a request is rejected, or
-- when an open request is deleted (e.g. cascade from account deletion).
-- Completed requests keep their slot: that capacity was actually used.
-- -----------------------------------------------------------------------------
create or replace function private.release_slot_on_reject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_release := old.status <> 'rejected' and new.status = 'rejected';
  elsif tg_op = 'DELETE' then
    v_release := old.status not in ('completed', 'rejected');
  end if;

  if v_release and old.pickup_slot_id is not null then
    perform 1
    from public.pickup_slots
    where id = old.pickup_slot_id
    for update;

    update public.pickup_slots
    set booked_count = greatest(booked_count - 1, 0)
    where id = old.pickup_slot_id;
  end if;

  return null; -- AFTER trigger: return value ignored
end;
$$;

drop trigger if exists requests_release_slot_on_reject on public.requests;
create trigger requests_release_slot_on_reject
  after update of status on public.requests
  for each row execute function private.release_slot_on_reject();

drop trigger if exists requests_release_slot_on_delete on public.requests;
create trigger requests_release_slot_on_delete
  after delete on public.requests
  for each row execute function private.release_slot_on_reject();

-- -----------------------------------------------------------------------------
-- Automatic audit trail for request lifecycle events. Written by the database
-- so the trail cannot be skipped by a client. ready -> completed is logged as
-- 'pickup_verified' by verify_pickup(), so it is not duplicated here.
-- -----------------------------------------------------------------------------
create or replace function private.audit_request_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, request_id, metadata)
    values (
      coalesce((select auth.uid()), new.resident_id),
      'request_created',
      new.id,
      jsonb_build_object('document_type_id', new.document_type_id)
    );
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  v_action := case new.status
    when 'reviewing' then 'request_reviewing'
    when 'ready'     then 'request_approved'
    when 'rejected'  then 'request_rejected'
    else null
  end;

  if v_action is not null then
    insert into public.audit_logs (actor_id, action, request_id, metadata)
    values (
      coalesce((select auth.uid()), new.reviewed_by),
      v_action,
      new.id,
      jsonb_strip_nulls(jsonb_build_object(
        'from_status', old.status,
        'to_status', new.status,
        'rejection_reason', new.rejection_reason,
        'released_slot_id', case when new.status = 'rejected' then old.pickup_slot_id end
      ))
    );
  end if;

  return null;
end;
$$;

drop trigger if exists requests_audit_insert on public.requests;
create trigger requests_audit_insert
  after insert on public.requests
  for each row execute function private.audit_request_changes();

drop trigger if exists requests_audit_status on public.requests;
create trigger requests_audit_status
  after update of status on public.requests
  for each row execute function private.audit_request_changes();

-- -----------------------------------------------------------------------------
-- verify_pickup(p_qr_token, p_staff_id)
-- Server-only RPC invoked by Vercel /api/verify-pickup.ts (using service_role).
-- Atomically validates the QR token, marks the request completed, and writes
-- an append-only audit log entry.
-- -----------------------------------------------------------------------------
create or replace function public.verify_pickup(
  p_qr_token  text,
  p_staff_id  uuid
)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_role  public.user_role;
  v_request     public.requests%rowtype;
  v_updated     public.requests%rowtype;
begin
  if p_qr_token is null or char_length(btrim(p_qr_token)) < 43 then
    raise exception 'Invalid QR pickup token'
      using errcode = '22023';
  end if;

  select role
  into v_staff_role
  from public.profiles
  where id = p_staff_id;

  if v_staff_role is null or v_staff_role not in ('staff', 'admin') then
    raise exception 'Only barangay staff or administrators can verify pickups'
      using errcode = '42501';
  end if;

  select *
  into v_request
  from public.requests
  where qr_token = btrim(p_qr_token)
  for update;

  if not found then
    raise exception 'Pickup pass not found'
      using errcode = 'P0002';
  end if;

  if v_request.resident_id = p_staff_id then
    raise exception 'Staff cannot verify pickup of their own request'
      using errcode = '42501';
  end if;

  if v_request.status = 'completed' then
    raise exception 'This pickup pass has already been claimed'
      using errcode = '22023';
  end if;

  if v_request.status <> 'ready' then
    raise exception 'Request is not ready for pickup (current status: %)', v_request.status
      using errcode = '22023';
  end if;

  update public.requests
  set status = 'completed',
      reviewed_by = p_staff_id,
      completed_at = now()
  where id = v_request.id
  returning * into v_updated;

  insert into public.audit_logs (actor_id, action, request_id, metadata)
  values (
    p_staff_id,
    'pickup_verified',
    v_updated.id,
    jsonb_build_object(
      'resident_id', v_updated.resident_id,
      'pickup_slot_id', v_updated.pickup_slot_id,
      'completed_at', v_updated.completed_at
    )
  );

  return v_updated;
end;
$$;

comment on function public.verify_pickup(text, uuid) is 'Server-only atomic QR pickup verification invoked by /api/verify-pickup.ts.';

revoke all on function public.verify_pickup(text, uuid) from public, anon, authenticated;
grant execute on function public.verify_pickup(text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- get_expired_attachment_paths(p_retention_days)
-- RA 10173 data retention helper (server-only). Returns attachment rows whose
-- parent request was completed or rejected at least p_retention_days ago
-- (default 30 days) so a scheduled server job can remove the files via the
-- Supabase Storage API and then delete the metadata rows.
-- -----------------------------------------------------------------------------
create or replace function public.get_expired_attachment_paths(
  p_retention_days integer default 30
)
returns table (
  attachment_id uuid,
  request_id    uuid,
  storage_path  text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_retention_days < 1 or p_retention_days > 365 then
    raise exception 'Retention window must be between 1 and 365 days'
      using errcode = '22023';
  end if;

  return query
  select ra.id, ra.request_id, ra.storage_path
  from public.request_attachments ra
  join public.requests r on r.id = ra.request_id
  where (r.status = 'completed' and r.completed_at <= now() - make_interval(days => p_retention_days))
     or (r.status = 'rejected'  and r.updated_at   <= now() - make_interval(days => p_retention_days));
end;
$$;

comment on function public.get_expired_attachment_paths(integer) is 'RA 10173 retention helper: lists requirement attachments eligible for purge after 30 days.';

revoke all on function public.get_expired_attachment_paths(integer) from public, anon, authenticated;
grant execute on function public.get_expired_attachment_paths(integer) to service_role;

commit;
