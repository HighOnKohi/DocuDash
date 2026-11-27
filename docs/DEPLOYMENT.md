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
   - Under **Authentication → URL Configuration**, set **Site URL** to `https://docu-dash-ph.vercel.app` and add `https://docu-dash-ph.vercel.app/**` (plus local/preview URLs such as `http://localhost:8081/**`) under **Redirect URLs**.
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
   - `ALLOWED_ORIGINS` — Comma-separated allowed origins, e.g. `https://docu-dash-ph.vercel.app,http://localhost:8081` (`https://docu-dash-ph.vercel.app` is also included by default in `api/_lib/http.ts`)
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
   - Visit `https://docu-dash-ph.vercel.app`; confirm landing page, login, registration, and staff portal load cleanly.
   - Confirm `GET https://docu-dash-ph.vercel.app/api/verify-pickup` returns `405 method_not_allowed` JSON with `Cache-Control: no-store` (proving the serverless function is active and protected).

---

## 4. Mobile Builds (Android & iOS with EAS)

DocuDash uses Continuous Native Generation (CNG) — never commit manual `ios/` or `android/` folders. Because DocuDash includes `expo-camera` and `expo-document-picker`, use a local native build (`npm run android` / `npm run ios`) or an EAS build for native testing:

```bash
# Configure EAS once
npx eas-cli@latest login
npx eas-cli@latest build:configure

# Native builds default EXPO_PUBLIC_API_BASE_URL to https://docu-dash-ph.vercel.app when unset
# Override in .env or EAS if targeting a staging/local API:
# EXPO_PUBLIC_API_BASE_URL=https://docu-dash-ph.vercel.app

# Development build (Android)
npx eas-cli@latest build --platform android --profile development

# Production builds
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

---

## 5. RA 10173 30-Day Attachment Retention Job (No Vercel Cron Required)

`POST /api/purge-attachments` queries `public.get_expired_attachment_paths(30)`, deletes expired ID files through the Supabase Storage API in 100-file batches (up to 500 per call), deletes the matching `request_attachments` rows only after Storage deletion succeeds, and appends a single PII-free `attachments_purged` audit log entry.

First, generate a random secret (`openssl rand -hex 32`) and add it as `CRON_SECRET` in **Vercel Project Settings → Environment Variables**. Then pick either free automated scheduler (no Vercel Cron needed):

### Option A — GitHub Actions (Already Configured)
`.github/workflows/retention-purge.yml` runs automatically every day at **03:00 AM `Asia/Manila`** (`19:00 UTC`) and supports one-click manual runs (including `dry_run` preview) in the **Actions** tab:
1. Open **GitHub Repository → Settings → Secrets and variables → Actions → New repository secret**.
2. Add `CRON_SECRET` with the exact same value set in Vercel.
3. *(Optional)* Test immediately via **Actions → RA 10173 Attachment Retention Purge → Run workflow** (try `dry_run: true` first).

### Option B — Supabase Native `pg_cron` + `pg_net` (Never Pauses on Repo Inactivity)
1. Enable `pg_cron` and `pg_net` in **Supabase Dashboard → Database → Extensions** (available on the Free tier).
2. Open `supabase/retention_pg_cron.sql`, replace `<YOUR_CRON_SECRET>` with your Vercel `CRON_SECRET`, and run it once in the **SQL Editor**.
3. The job (`docudash-ra10173-attachment-purge`) executes daily at **03:00 AM `Asia/Manila`** directly from Postgres using Supabase Vault.
