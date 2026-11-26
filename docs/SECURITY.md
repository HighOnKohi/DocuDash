# DocuDash — Security & Privacy (RA 10173)

DocuDash handles sensitive resident personally identifiable information (PII) and government-issued IDs. Security is enforced in depth across PostgreSQL Row-Level Security, database triggers, server-only Vercel functions, private storage policies, and client bundle isolation.

---

## 1. Row-Level Security (RLS) Matrix

Every table in `public` has RLS enabled (`002_rls_policies.sql`). The `anon` role has zero table privileges; `authenticated` users receive only the minimum SQL verbs required by their policies.

| Table / Resource | `anon` | `resident` (`authenticated`) | `staff` (`authenticated`) | `admin` (`authenticated`) | `service_role` (Vercel `/api` only) |
| --- | --- | --- | --- | --- | --- |
| `public.profiles` | None | `SELECT` own row; `INSERT` own row (`role='resident'` fallback); `UPDATE` own contact fields only (`role`, `id`, `created_at`, `privacy_consent_at` locked by trigger) | `SELECT` all profiles; `UPDATE` own contact fields only | `SELECT` all profiles; `UPDATE` own contact fields or other users' roles (cannot change own role) | Full access |
| `public.document_types` | None | `SELECT` where `is_active = true` | `SELECT` all (including inactive) | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Full access |
| `public.pickup_slots` | None | `SELECT` all; cannot mutate directly (must call `book_pickup_slot` RPC) | `SELECT`, `INSERT` (today/future only, `booked_count` forced to `0`), `UPDATE` capacity/unbooked schedule, `DELETE` only when `booked_count = 0` | Same as `staff` | Full access |
| `public.requests` | None | `SELECT` own rows; `INSERT` own row in `pending` state for active document type; `UPDATE` `purpose` only while `pending` | `SELECT` all; `UPDATE` workflow `pending→reviewing/rejected` and `reviewing→ready/rejected` (cannot process own requests; cannot set `completed` directly) | Same as `staff` | Full access (used via `verify_pickup()` for `ready→completed`) |
| `public.request_attachments` | None | `SELECT` own; `INSERT` on own `pending` request at `{uid}/{reqId}/*` matching `required_docs`; `DELETE` on own `pending` request; no `UPDATE` | `SELECT` all | `SELECT` all | Full access (used for 30-day retention purge) |
| `public.audit_logs` | None | None (cannot read or insert directly; lifecycle events written via `SECURITY DEFINER` triggers/RPCs) | `SELECT` all; `INSERT` with `actor_id = auth.uid()` | Same as `staff` | `SELECT` & `INSERT` (`UPDATE`/`DELETE`/`TRUNCATE` blocked by trigger for ALL roles) |
| `storage.objects` (`requirements` bucket) | None | `SELECT` own `{uid}/` folder; `INSERT` & `DELETE` inside `{uid}/{reqId}/{file}` for own `pending` requests only; no `UPDATE` (`upsert: false`) | `SELECT` all in `requirements` (used to mint 60s signed URLs) | Same as `staff` | Full access |

### Code-Path Verification Against RLS Matrix
- **UI layer (`app/`, `components/`):** Verified 0 direct imports of `@supabase/supabase-js`, `getSupabaseClient`, or `createClient`.
- **Registration (`services/authService.ts`):** Requires `privacyConsentAccepted === true`, sends `privacy_consent_at` in `options.data`, and never passes `role`. Even if bypassed via raw API call, `private.handle_new_user()` rejects null consent (`23514`) and hardcodes `'resident'`.
- **Slot Booking (`services/scheduleService.ts`):** Always delegates to `supabase.rpc('book_pickup_slot', ...)`, never directly updating `pickup_slots.booked_count` or `requests.pickup_slot_id` (both blocked by triggers for `authenticated`).
- **Staff Review (`services/requestService.ts` + `app/(admin)/requests/[id].tsx`):** Only issues `reviewing`, `ready`, and `rejected` transitions; `completed` is exclusively triggered via `POST /api/verify-pickup` → `public.verify_pickup()`.
- **Storage Uploads (`services/storageService.ts`):** Always uploads with `upsert: false`, enforces the 5 MiB limit and allowed MIME types, generates `{user_id}/{request_id}/{unique-filename}` paths, and deletes orphaned storage objects if the `request_attachments` insert fails.

---

## 2. Database-Enforced Integrity & Anti-Tampering

1. **Role Helpers (`public.is_staff()`, `public.is_admin()`):** Declared `SECURITY DEFINER` with `set search_path = ''` so RLS policies can inspect `public.profiles.role` without infinite RLS recursion or search-path hijacking.
2. **Column-Protection Triggers (`002_rls_policies.sql`):**
   - `profiles_guard_update` blocks client modifications to `id`, `created_at`, `privacy_consent_at`, and unauthorized `role` changes (admins cannot change their own role).
   - `requests_guard_update` blocks client writes to `qr_token`, `pickup_slot_id`, `completed_at`, `created_at`, and `resident_id`; enforces the staff state machine; blocks staff from processing their own requests; and generates a 43-character base64url **256-bit CSPRNG** `qr_token` via `extensions.gen_random_bytes(32)` strictly on transition to `ready`.
   - `pickup_slots_guard_write` prevents past slot creation, blocks direct `booked_count` edits, forbids moving date/time once booked, and prevents capacity drops below `booked_count`.
3. **Server-Assigned Timestamps (`001_schema.sql`):** `private.force_insert_timestamps()` overwrites client-supplied `requests.created_at` (prevents queue jumping), `request_attachments.uploaded_at` (prevents retention evasion), and `audit_logs.created_at` (for every role).
4. **Atomic Concurrency & Slot Cleanup (`003_rpc_functions.sql`):**
   - `book_pickup_slot()` locks the request row and involved `pickup_slots` rows in deterministic UUID order (`ORDER BY id FOR UPDATE`) to prevent overbooking and deadlocks.
   - `requests_release_slot_on_reject` and `requests_release_slot_on_delete` atomically restore `booked_count` when a request is rejected (while clearing `pickup_slot_id`) or deleted before completion.
5. **Immutable Audit Trail (`001_schema.sql`, `003_rpc_functions.sql`):**
   - `audit_logs_no_update_delete` and `audit_logs_no_truncate` reject `UPDATE`, `DELETE`, and `TRUNCATE` for **every role**, including table owners and `service_role`.
   - `requests_audit_insert` and `requests_audit_status` automatically record `request_created`, `request_reviewing`, `request_approved`, and `request_rejected` directly inside Postgres so clients cannot skip logging.
6. **Server-Only Pickup Verification (`003_rpc_functions.sql`, `api/verify-pickup.ts`):**
   - `EXECUTE` on `public.verify_pickup(p_qr_token, p_staff_id)` is revoked from `public`, `anon`, and `authenticated` and granted solely to `service_role`.
   - Locks the request row (`FOR UPDATE`), verifies `p_staff_id` is `staff`/`admin` and not the resident, rejects replayed (`completed`) or non-`ready` tokens, transitions to `completed`, and inserts `pickup_verified` in one transaction.

---

## 3. Data Privacy Act of 2012 (RA 10173) Compliance

| Requirement | Implementation |
| --- | --- |
| **Explicit Informed Consent** | Registration screen (`app/(auth)/register.tsx`) displays a plain-language privacy notice and requires an explicit checkbox. The timestamp is stored in `profiles.privacy_consent_at NOT NULL` and cannot be modified afterward. |
| **Private Document Storage** | `requirements` bucket is created with `public = false`, 5 MiB limit, and strict MIME allow-list (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`). |
| **Time-Bound Staff Access** | Staff inspect resident IDs exclusively via 60-second signed URLs (`SIGNED_URL_TTL_SECONDS = 60`). The admin viewer counts down live and wipes the preview from state at `0s`, while logging `attachment_viewed` in `audit_logs`. |
| **Storage Limitation (30-Day Retention)** | `public.get_expired_attachment_paths(p_retention_days default 30)` (restricted to `service_role`) returns attachments from requests completed or rejected ≥ 30 days ago for scheduled removal via the Supabase Storage API. |
| **PII Minimization in Logs** | `audit_logs.metadata` stores UUID references (`request_id`, `recipient_id`, `email_id`, `event`, `channel`), never raw email addresses, contact numbers, or ID file contents. |

---

## 4. Application, Transport & Secret Hygiene

- **Secret separation:** Only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_API_BASE_URL` may be bundled into the client. `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, and `ALLOWED_ORIGINS` exist exclusively in Vercel server environment variables.
- **Metro exclusion (`metro.config.js`):** Root-anchored `resolver.blockList` prevents Metro from ever resolving or bundling `api/` or `supabase/`.
- **API authentication (`api/_lib/auth.ts`):** Every `/api/*` endpoint cryptographically validates the `Authorization: Bearer <jwt>` token against `supabaseAdmin.auth.getUser(token)` and checks `profiles.role IN ('staff', 'admin')`.
- **Strict CORS (`api/_lib/http.ts`):** Rejects unknown cross-origin requests with `403`, never reflects untrusted origins, and sets `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `Vary: Origin`.
- **HTTP security headers (`vercel.json`):** Sets `Strict-Transport-Security` (2-year HSTS + preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.
- **Least-privilege API keys:** Resend integration uses a `sending_access`-only API key (`DocuDash App Sending`), never a full-access key.
- **Mobile permissions (`app.json`):** `expo-camera` config sets `recordAudioAndroid: false` so Android never requests microphone permission.
