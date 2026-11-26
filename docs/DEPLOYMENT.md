# DocuDash — Deployment Guide

This guide covers deploying DocuDash to **Supabase** (database, Auth, private Storage, Realtime), **Vercel** (Expo Web SPA + `/api/*` Serverless Functions), **Resend** (transactional notifications), and **EAS** (Android/iOS native builds).

---

## 1. Supabase Project Setup

1. Create a new project at [supabase.com](https://supabase.com) (recommended region: **Southeast Asia — Singapore** for lowest latency to the Philippines).
2. Open the **SQL Editor** and run the 4 migrations in order:
   1. `supabase/migrations/001_schema.sql`
   2. `supabase/migrations/002_rls_policies.sql`
   3. `supabase/migrations/003_rpc_functions.sql`
   4. `supabase/migrations/004_storage.sql`
3. Verify the setup:
   - **Table Editor:** `document_types` contains the 4 seeded barangay documents; RLS is enabled on all 6 tables.
   - **Storage:** `requirements` bucket exists and is marked **Private** (`public = false`).
   - **Database → Replication / Publications:** `supabase_realtime` includes `public.requests` and `public.pickup_slots`.
4. **Authentication Settings:**
   - Under **Authentication → URL Configuration**, set **Site URL** to your Vercel deployment URL (e.g., `https://docudash.vercel.app`) and add local/preview redirect URLs as needed.
   - *(Optional)* Under **Authentication → SMTP Settings**, configure Resend Custom SMTP (`smtp.resend.com`, port `465` SSL or `587` STARTTLS, username `resend`, password = your sending-only `RESEND_API_KEY`) once you have a verified domain. Without a custom domain, keep Supabase's default mailer or disable email confirmation during development.
5. **Promote the First Admin Account:**
   Signup always creates `role = 'resident'`. Register your initial admin user in the app, copy their UUID from **Authentication → Users**, and run once in the SQL Editor:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = '<your-user-uuid>';
   ```
   After that, sign out and back in to enter the Barangay Staff Web Portal.

---

## 2. Resend Email Setup (Optional)

If you want `POST /api/notify-resident` to deliver emails (otherwise it logs alerts cleanly alongside live Supabase Realtime):

1. Create a **sending-only** API key (`sending_access`, never full-access) in [resend.com/api-keys](https://resend.com/api-keys).
2. Ensure the template `docudash-status-update` (7 string variables: `RESIDENT_NAME`, `HEADLINE`, `DOCUMENT_NAME`, `STATUS_LABEL`, `BODY_MESSAGE`, `PICKUP_SLOT`, `OFFICE_NOTE`) is **published** in Resend.
3. **Production domain:** Add and verify a dedicated sending subdomain (e.g., `mail.yourbarangay.ph`) in [resend.com/domains](https://resend.com/domains), add its DKIM/SPF/DMARC DNS records, and set:
   ```text
   NOTIFICATION_FROM_EMAIL=DocuDash <notifications@mail.yourbarangay.ph>
   ```
   *(Sandbox testing without a custom domain uses `DocuDash <onboarding@resend.dev>`, which can only deliver to your own Resend account email and `@resend.dev` test addresses.)*

---

## 3. Vercel Web & API Deployment

The Expo app and `api/` live at the **repository root** (`./`).

1. Import the GitHub repository into [vercel.com](https://vercel.com) and leave **Root Directory** as default (`./`).
2. `vercel.json` automatically configures:
   - `installCommand`: `npm ci`
   - `buildCommand`: `npx expo export -p web`
   - `outputDirectory`: `dist`
   - `functions`: `api/*.ts` with `maxDuration: 10` (matches `api/verify-pickup.ts` and `api/notify-resident.ts`, ignoring `api/_lib/`)
   - `rewrites`: SPA fallback `/((?!api/).*)` → `/` (keeps `/api/*` routing intact)
   - Security headers (HSTS, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`, `Cache-Control: no-store` on `/api/*`)
3. Add **Environment Variables** in **Vercel Project Settings → Environment Variables**:

   **Client (bundled into SPA):**
   - `EXPO_PUBLIC_SUPABASE_URL` — `https://<ref>.supabase.co`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
   - `EXPO_PUBLIC_API_BASE_URL` — Leave blank on Vercel web (uses same-origin `/api/*`)

   **Server-only (NEVER prefix with `EXPO_PUBLIC_`):**
   - `SUPABASE_URL` — `https://<ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
   - `ALLOWED_ORIGINS` — Comma-separated allowed origins, e.g. `https://your-app.vercel.app,http://localhost:8081`
   - `SMTP_HOST` *(optional)* — SMTP host for `/api/notify-resident` (defaults to `smtp.gmail.com`)
   - `SMTP_PORT` *(optional)* — SMTP port (`465` for SSL or `587` for STARTTLS; defaults to `465`)
   - `SMTP_USER` *(optional)* — SMTP login username (e.g. your Gmail address; takes priority over Resend when set with `SMTP_PASS`)
   - `SMTP_PASS` *(optional)* — SMTP password or 16-character Gmail App Password (no spaces)
   - `SMTP_FROM` *(optional)* — Sender display string (defaults to `DocuDash <$SMTP_USER>`)
   - `RESEND_API_KEY` *(optional)* — Sending-only Resend key (used when SMTP is not configured)
   - `NOTIFICATION_FROM_EMAIL` *(optional)* — Verified sender or `DocuDash <onboarding@resend.dev>`
   - `RESEND_TEMPLATE_ID` *(optional)* — Published template ID or `docudash-status-update`
   - `CRON_SECRET` *(optional)* — Shared secret for scheduled RA 10173 retention purge jobs

4. Deploy and verify:
   - Visit the deployed URL; confirm landing page, login, registration, and staff portal load cleanly.
   - Confirm `GET /api/verify-pickup` returns `405 method_not_allowed` JSON with `Cache-Control: no-store` (proving the serverless function is active and protected).

---

## 4. Mobile Builds (Android & iOS with EAS)

DocuDash uses Continuous Native Generation (CNG) — never commit manual `ios/` or `android/` folders. Because DocuDash includes `expo-camera` and `expo-document-picker`, use an EAS development build or preview/production build for native testing:

```bash
# Configure EAS once
npx eas-cli@latest login
npx eas-cli@latest build:configure

# Set client environment variables in EAS (EXPO_PUBLIC_API_BASE_URL is REQUIRED on native!)
# e.g. EXPO_PUBLIC_API_BASE_URL=https://your-app.vercel.app

# Development build (Android)
npx eas-cli@latest build --platform android --profile development

# Production builds
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

---

## 5. RA 10173 30-Day Attachment Retention Job

To enforce automatic purging of uploaded IDs 30 days after request completion or rejection, run a daily scheduled job (e.g., Vercel Cron authenticated via `CRON_SECRET` or a Supabase scheduled Edge Function) that:
1. Calls `supabaseAdmin.rpc('get_expired_attachment_paths', { p_retention_days: 30 })`.
2. Removes returned `storage_path` files via `supabaseAdmin.storage.from('requirements').remove(paths)`.
3. Deletes the matching `request_attachments` rows and appends a single `attachments_purged` audit log entry with the purged count (no PII).
