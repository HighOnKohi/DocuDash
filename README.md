# DocuDash

**Barangay Document Pre-Processing and Scheduled Pickup Application**

DocuDash modernizes barangay document issuance (Barangay Clearance, Certificate of Indigency, Certificate of Residency, Business Clearance) by moving document intake, requirement verification, and pickup scheduling online—eliminating long hall queues while preserving strict data privacy under the Philippine **Data Privacy Act of 2012 (Republic Act No. 10173)**.

---

## Key Capabilities

### Resident Experience (Android, iOS, Web)
- **Self-service registration & RA 10173 consent:** Explicit, timestamped Data Privacy Act consent enforced both in the UI and at the PostgreSQL trigger level (`on_auth_user_created`).
- **Online document requests:** Browse active barangay documents with fees and required document checklists, submit a purpose, and upload requirement files (JPEG, PNG, WebP, PDF up to 5 MiB) into a private bucket.
- **Atomic pickup slot booking:** Reserve or re-book upcoming barangay counter time windows backed by row-level `SELECT ... FOR UPDATE` locking so slots can never be overbooked.
- **Live status tracking & QR pickup pass:** Real-time status updates via Supabase Realtime (`pending` → `reviewing` → `ready` → `completed` / `rejected`) and a vector QR pickup pass generated from a server-side 256-bit CSPRNG token.
- **Profile & privacy transparency:** Edit contact details, inspect recorded RA 10173 consent timestamp, and review the 30-day attachment retention policy.

### Barangay Staff Web Portal (Desktop-First Responsive Web & Mobile)
- **Role-guarded portal:** Persistent desktop sidebar (≥ 1024px) and adaptive mobile header restricted to `staff` and `admin` roles via Expo Router `Stack.Protected`, layout guards, and Postgres RLS.
- **Live FIFO queue & daily metrics:** Real-time request queue with status counts, today's pickup capacity progress bars, status filter pills, and resident/document search.
- **60-second signed requirement viewer:** Inspect private resident IDs via 60-second expiring signed URLs with a live countdown timer that clears previews on expiry and writes immutable `attachment_viewed` audit entries.
- **Workflow & notifications:** Enforce `pending` → `reviewing` → `ready` / `rejected` transitions (blocking self-review and requiring rejection reasons), automatically release slots on rejection, and optionally notify residents via `/api/notify-resident` (Resend SDK + published template with in-app Realtime fallback).
- **Schedule management:** Create individual windows or standard 4-window barangay days (`08:00-10:00` through `15:00-17:00`), adjust capacity, and delete unbooked slots.
- **QR counter verification:** Scan resident QR passes with a browser webcam (`jsqr`) or native device camera (`expo-camera`), or enter tokens manually / with a USB barcode reader, invoking server-only `POST /api/verify-pickup`.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Client framework | Expo SDK 58, React Native 0.88, React 19.3 (React Compiler), Expo Router 58 (typed routes) |
| Language & styling | TypeScript (strict + `noUncheckedIndexedAccess`), NativeWind 4.2 (Tailwind CSS 3.4, light mode only) |
| Icons | `@expo/vector-icons/MaterialIcons` (no emojis in UI) |
| Database, Auth, Storage, Realtime | Supabase (PostgreSQL 17, Auth, private Storage, Realtime `postgres_changes`) |
| Server API & Web Hosting | Vercel Static Export (`dist/`) + Vercel Serverless Functions (`api/*.ts`) |
| Transactional Email (optional) | Resend Node.js SDK (`resend`) with published template & idempotency keys |

---

## Project Structure

```text
.
├── app/                         # Expo Router screens only (UI layer; zero direct Supabase calls)
│   ├── _layout.tsx              # AuthProvider, SplashScreen, Stack.Protected role guards
│   ├── index.tsx                # Public landing screen
│   ├── (auth)/                  # login.tsx, register.tsx (RA 10173 consent)
│   ├── (resident)/              # Resident tabs: index, request-new, request/[id], profile
│   └── (admin)/                 # Staff portal: sidebar _layout, index, requests/[id], schedules, scanner
├── components/                  # Reusable stateless UI primitives, QrCodeMatrix, QrScannerView (.tsx / .web.tsx)
├── contexts/                    # AuthContext (session + profile state backed by services/authService)
├── constants/                   # Design tokens (theme.ts) and Asia/Manila/PHP formatters (format.ts)
├── services/                    # Client data layer (only layer talking to Supabase anon key or /api)
│   ├── supabase.ts              # Lazy typed client, platform storage, ServiceError, callApi()
│   ├── authService.ts
│   ├── requestService.ts
│   ├── storageService.ts
│   ├── scheduleService.ts
│   └── auditService.ts
├── api/                         # Server-only Vercel Serverless Functions (blocked from Metro bundle)
│   ├── _lib/                    # supabaseAdmin.ts, auth.ts, http.ts, resend.ts
│   ├── verify-pickup.ts         # POST /api/verify-pickup
│   └── notify-resident.ts       # POST /api/notify-resident
├── supabase/migrations/         # Idempotent SQL migrations: 001_schema -> 004_storage
├── types/                       # Shared Database TypeScript definitions & API contracts
└── docs/                        # Deep-dive documentation
```

---

## Quickstart

### 1. Prerequisites
- Node.js 20+ and npm
- A Supabase project ([supabase.com](https://supabase.com))
- Optional: Vercel CLI (`npx vercel`) for testing `/api/*` locally, and a Resend account for email notifications

### 2. Install Dependencies
```bash
npm ci
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env.local` (or `.env`) and fill in your Supabase values:
```bash
cp .env.example .env.local
```

Required for local client testing:
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `EXPO_PUBLIC_API_BASE_URL` — Leave empty on web (same origin) or set to your Vercel deployment URL for native builds

Required on Vercel (server-only, never prefixed with `EXPO_PUBLIC_`):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS` (comma-separated CORS allow-list)
- Optional: `RESEND_API_KEY` (sending-only), `NOTIFICATION_FROM_EMAIL`, `RESEND_TEMPLATE_ID`, `CRON_SECRET`

### 4. Apply Database Migrations
Run the 4 SQL migrations in order in the Supabase SQL Editor (or via Supabase CLI):
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_rpc_functions.sql`
4. `supabase/migrations/004_storage.sql`

To promote your first administrator account after registering through the app:
```sql
update public.profiles set role = 'admin' where id = '<user-uuid>';
```

### 5. Run Locally
```bash
npm run web         # Start Expo Web dev server
npm start           # Start Expo dev server (Android / iOS / Web)
```

---

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start Expo dev server |
| `npm run web` | Start Expo Web dev server |
| `npm run android` / `npm run ios` | Launch on Android or iOS |
| `npm run build:web` | Export static SPA web bundle to `dist/` |
| `npm run typecheck` | Run TypeScript strict typecheck (`tsc --noEmit`) |
| `npm run lint` | Run ESLint (`expo lint`, including React Compiler rules) |
| `npm run doctor` | Run `npx expo-doctor` diagnostics |

---

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) — system diagrams, layering boundaries, role routing, Realtime, and QR workflows
- [Security & Privacy](docs/SECURITY.md) — complete RLS policy matrix, server-side guards, RA 10173 compliance, and threat mitigations
- [API & Database Reference](docs/API_AND_DB.md) — tables, triggers, RPCs, storage conventions, service layer, and `/api/*` endpoints
- [Deployment Guide](docs/DEPLOYMENT.md) — Supabase, Vercel, Resend, and EAS native build setup
- [Project Master Tracker](PROJECT.md) — phase-by-phase build log, file inventory, and audit verification record
