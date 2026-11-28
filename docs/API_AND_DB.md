# DocuDash — API & Database Reference

---

## 1. PostgreSQL Schema (`supabase/migrations/`)

Run migrations in order: `001_schema.sql` → `002_rls_policies.sql` → `003_rpc_functions.sql` → `004_storage.sql`. All 4 scripts are idempotent.

### Enums
- `public.user_role`: `'resident' | 'staff' | 'admin'`
- `public.request_status`: `'pending' | 'reviewing' | 'ready' | 'completed' | 'rejected'`

### Tables

#### `public.profiles` (1:1 with `auth.users`)
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | References `auth.users(id) ON DELETE CASCADE` |
| `full_name` | `text` NOT NULL | Trimmed length 2–120 |
| `address` | `text` NOT NULL | Trimmed length 5–300 |
| `contact_number` | `text` NOT NULL | Regex `^\+?[0-9][0-9 -]{6,18}[0-9]$` |
| `role` | `user_role` NOT NULL | Default `'resident'`; immutable by client |
| `privacy_consent_at` | `timestamptz` NOT NULL | Explicit RA 10173 consent timestamp (not future) |
| `created_at` | `timestamptz` NOT NULL | Server-assigned on insert |

#### `public.document_types`
Seeded with 4 barangay documents: **Barangay Clearance** (PHP 50), **Certificate of Indigency** (Free), **Certificate of Residency** (PHP 30), and **Business Clearance** (PHP 300).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `name` | `text` UNIQUE NOT NULL | Length 3–120 |
| `description` | `text` NOT NULL | Default `''` |
| `fee` | `numeric(10,2)` NOT NULL | `>= 0` |
| `required_docs` | `jsonb` NOT NULL | Array of `{ key, label, description }` |
| `is_active` | `boolean` NOT NULL | Default `true` |
| `created_at` | `timestamptz` NOT NULL | Default `now()` |

#### `public.pickup_slots`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `slot_date` | `date` NOT NULL | Local date (`Asia/Manila`) |
| `time_window` | `text` NOT NULL | 24h `"HH:MM-HH:MM"`, start < end |
| `max_capacity` | `integer` NOT NULL | 1–500 |
| `booked_count` | `integer` NOT NULL | `0 <= booked_count <= max_capacity`; maintained by RPC/triggers |
| `created_at` | `timestamptz` NOT NULL | Default `now()` |
| Unique | `(slot_date, time_window)` | Prevents duplicate windows |

#### `public.requests`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `resident_id` | `uuid` NOT NULL | FK `profiles(id) ON DELETE CASCADE` |
| `document_type_id` | `uuid` NOT NULL | FK `document_types(id) ON DELETE RESTRICT` |
| `purpose` | `text` NOT NULL | Trimmed length 3–500 |
| `status` | `request_status` NOT NULL | Default `'pending'` |
| `rejection_reason` | `text` | Required (≥ 3 chars) when `status = 'rejected'` |
| `pickup_slot_id` | `uuid` | FK `pickup_slots(id) ON DELETE RESTRICT`; cleared on rejection |
| `qr_token` | `text` UNIQUE | Non-null (43+ chars) iff `status IN ('ready', 'completed')` |
| `reviewed_by` | `uuid` | FK `profiles(id) ON DELETE SET NULL` |
| `completed_at` | `timestamptz` | Non-null iff `status = 'completed'` |
| `created_at` / `updated_at` | `timestamptz` NOT NULL | Maintained by triggers |

#### `public.request_attachments`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `request_id` | `uuid` NOT NULL | FK `requests(id) ON DELETE CASCADE` |
| `storage_path` | `text` UNIQUE NOT NULL | Matches `{uuid}/{uuid}/{filename}` |
| `doc_type` | `text` NOT NULL | Must exist in parent `document_types.required_docs[*].key` |
| `uploaded_at` | `timestamptz` NOT NULL | Server-assigned on insert |

#### `public.audit_logs`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigint` IDENTITY PK | Monotonic sequence |
| `actor_id` | `uuid` | Actor user ID (no FK so history survives account deletion) |
| `action` | `text` NOT NULL | Snake-case action identifier (`^[a-z][a-z0-9_]{2,63}$`) |
| `request_id` | `uuid` | Associated request UUID (nullable, no FK) |
| `metadata` | `jsonb` NOT NULL | JSON object (data-minimized, no raw PII) |
| `created_at` | `timestamptz` NOT NULL | Forced to `now()` for all roles |

### Realtime Publication
`public.requests` and `public.pickup_slots` are added to `supabase_realtime`. Supabase Realtime applies RLS policies before delivering `postgres_changes` events.

### PostgreSQL RPC Functions

| Function | Executable By | Purpose |
| --- | --- | --- |
| `public.is_staff()` | `authenticated`, `service_role` | Returns `true` if `auth.uid()` has role `staff` or `admin`. |
| `public.is_admin()` | `authenticated`, `service_role` | Returns `true` if `auth.uid()` has role `admin`. |
| `public.book_pickup_slot(p_request_id uuid, p_slot_id uuid)` | `authenticated`, `service_role` | Atomically reserves or re-books a slot using deterministic `FOR UPDATE` locking, decrements old slot if re-booking, logs `slot_booked` / `slot_rebooked`, returns updated `requests` row. |
| `public.verify_pickup(p_qr_token text, p_staff_id uuid)` | `service_role` ONLY | Validates staff role & separation of duties, locks request by `qr_token`, rejects replay/non-`ready`, transitions to `completed`, logs `pickup_verified`, returns updated `requests` row. |
| `public.get_expired_attachment_paths(p_retention_days int default 30)` | `service_role` ONLY | Returns `{ attachment_id, request_id, storage_path }` rows eligible for RA 10173 30-day purge. |

### Private Storage Bucket (`004_storage.sql`)
- Bucket ID: `requirements` (`public = false`, `file_size_limit = 5242880` bytes, allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`).
- Object path convention: `{user_id}/{request_id}/{unique-filename}` (exactly 2 folder segments).
- No `UPDATE` policy: uploads must pass `upsert: false` (replace by delete + upload).

---

## 2. Vercel Serverless API (`api/`)

All `/api/*` endpoints enforce:
- Strict CORS (`https://docu-dash-ph.vercel.app` + `ALLOWED_ORIGINS` + exact same-origin requests; `403 origin_not_allowed` otherwise)
- `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`
- `Authorization: Bearer <supabase-access-token>` verified via `supabaseAdmin.auth.getUser(token)` + `profiles.role IN ('staff', 'admin')`
- Standardized error envelope (`ApiErrorResponse`):
  ```json
  { "ok": false, "code": "string", "error": "Human-readable message" }
  ```

### `POST /api/verify-pickup`
Atomically verifies a resident's QR pickup pass and completes the document release.

**Request Body:**
```json
{ "qrToken": "<43-char-base64url-token>" }
```

**Success (`200 OK` — `VerifyPickupResponse`):**
```json
{
  "ok": true,
  "request": { "...DocumentRequest row (status: 'completed')..." },
  "resident": { "id": "...", "full_name": "...", "address": "...", "contact_number": "..." },
  "documentType": { "id": "...", "name": "Barangay Clearance", "fee": 50 },
  "pickupSlot": { "id": "...", "slot_date": "2026-11-27", "time_window": "08:00-10:00" }
}
```

**Error Status Codes:**
- `400 invalid_qr_token` — Token missing or malformed (must match `^[A-Za-z0-9_-]{43,128}$`)
- `401 missing_auth` / `invalid_token` — Missing or expired JWT
- `403 forbidden` — Caller is not staff/admin, or staff tried to verify their own request
- `404 pickup_not_found` — Unknown QR token
- `409 already_claimed` / `not_ready_for_pickup` — Pass was already claimed or request is not `ready`

---

### `POST /api/notify-resident`
Dispatches a status update or pickup reminder alert to a resident and writes a `notification_dispatched` audit log entry.

**Request Body (`NotifyResidentPayload`):**
```json
{
  "requestId": "<request-uuid>",
  "event": "reviewing | ready | rejected | completed | slot_reminder",
  "message": "Optional note from barangay office (max 500 chars)"
}
```

**Delivery Behavior:**
- When `RESEND_API_KEY` (sending-only) and `NOTIFICATION_FROM_EMAIL` are configured, sends an email via the official `resend` Node SDK using the published Resend template (`RESEND_TEMPLATE_ID`, default `docudash-status-update`) with deterministic idempotency keys (`notify-<event>/<requestId>` or `slot-reminder/<requestId>/<slotDate>`) and bounded retries on `429`/`5xx`.
- When Resend env vars are absent, returns `deliveredVia: "in_app_logged"` (residents still receive live status updates via Supabase Realtime).

**Success (`200 OK` — `NotifyResidentResponse`):**
```json
{
  "ok": true,
  "requestId": "<request-uuid>",
  "event": "ready",
  "deliveredVia": "email",
  "emailId": "<resend-email-id>",
  "auditLogged": true
}
```

**Error Status Codes:** `400` (invalid UUID/event/message), `401`/`403` (auth/role), `404 request_not_found`, `502 notification_provider_error`.

---

### `POST /api/purge-attachments`
Purges resident requirement attachments from the private `requirements` bucket for requests completed or rejected at least `retentionDays` ago (default `30` days, RA 10173 compliance).

**Authorization:** Either `Authorization: Bearer <CRON_SECRET>` (constant-time SHA-256 comparison; used by `.github/workflows/retention-purge.yml` or `supabase/retention_pg_cron.sql`) OR an authenticated admin JWT (`profiles.role = 'admin'`).

**Request Body (optional — `PurgeAttachmentsPayload`):**
```json
{
  "retentionDays": 30,
  "dryRun": false
}
```

**Success (`200 OK` — `PurgeAttachmentsResponse`):**
```json
{
  "ok": true,
  "retentionDays": 30,
  "dryRun": false,
  "matchedCount": 4,
  "purgedCount": 4,
  "failedCount": 0,
  "affectedRequestCount": 2,
  "hasMore": false,
  "auditLogged": true,
  "triggeredBy": "cron_secret"
}
```

**Error Status Codes:** `400 invalid_retention_days` / `invalid_dry_run`, `401 missing_auth` / `invalid_token`, `403 forbidden`, `500 retention_lookup_failed`.

---

### `POST /api/delete-account`
Self-service RA 10173 right-to-erasure endpoint for resident accounts. Deletes all private Storage requirement files under the resident's account first, records a PII-free `account_deleted` entry in `audit_logs`, and deletes the Supabase Auth user (cascading `profiles`, `requests`, and `request_attachments`, and releasing open pickup slots via trigger). Staff/admin self-deletion is blocked (`403 staff_self_delete_forbidden`).

**Request Body (`DeleteAccountPayload`):**
```json
{
  "confirmation": "DELETE"
}
```

**Success (`200 OK` — `DeleteAccountResponse`):**
```json
{
  "ok": true,
  "deletedRequestsCount": 2,
  "deletedAttachmentsCount": 4,
  "auditLogged": true
}
```

**Error Status Codes:** `400 confirmation_required`, `401 missing_auth` / `invalid_token`, `403 staff_self_delete_forbidden`, `500 storage_cleanup_failed` / `account_delete_failed`.

---

## 3. Client Service Layer Summary (`services/`)

| Module | Key Exports |
| --- | --- |
| `services/supabase.ts` | `PRODUCTION_APP_URL`, `isSupabaseConfigured`, `getSupabaseClient`, `requireAuthenticatedUserId`, `getApiBaseUrl`, `getAppOrigin`, `callApi`, `ServiceError`, `toServiceError` |
| `services/authService.ts` | `register`, `login`, `logout`, `getSession`, `getCurrentUser`, `getCurrentProfile`, `updateProfile`, `onAuthStateChange`, `isStaffRole`, `isAdminRole` |
| `services/requestService.ts` | `listDocumentTypes`, `createRequest`, `updateRequestPurpose`, `listResidentRequests`, `listAllRequests`, `getRequestById`, `startReview`, `approveRequest`, `rejectRequest`, `verifyPickupByQrToken`, `notifyResident`, `subscribeToRequest`, `subscribeToResidentRequests`, `subscribeToAllRequests` |
| `services/storageService.ts` | `buildAttachmentPath`, `uploadRequirementAttachment`, `deleteRequirementAttachment`, `listRequestAttachments`, `getSignedAttachmentUrl` (`60s` TTL) |
| `services/scheduleService.ts` | `getTodayManilaDate`, `listPickupSlots`, `getPickupSlotById`, `createPickupSlot`, `updatePickupSlot`, `deletePickupSlot`, `bookPickupSlot`, `subscribeToPickupSlots` |
| `services/auditService.ts` | `appendAuditLog`, `listAuditLogs` |
