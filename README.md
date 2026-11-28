<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<br />
<div align="center">
  <a href="https://github.com/HighOnKohi/DocuDash">
    <img src="assets/images/logo.png" alt="DocuDash Logo" width="88" height="88" />
  </a>

  <h3 align="center">DocuDash</h3>

  <p align="center">
    <strong>Barangay Document Pre-Processing &amp; Scheduled Pickup Application</strong>
    <br />
    Eliminate long barangay hall queues with online intake, GCash/Cash payment verification, QR pickup passes, real-time notifications, and strict RA 10173 data privacy.
    <br />
    <a href="docs/ARCHITECTURE.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://docu-dash-ph.vercel.app">View Live Portal</a>
    ·
    <a href="https://github.com/HighOnKohi/DocuDash/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    ·
    <a href="https://github.com/HighOnKohi/DocuDash/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#key-capabilities">Key Capabilities</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li><a href="#project-structure">Project Structure</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#environment-variables">Environment Variables</a></li>
        <li><a href="#database-migrations">Database Migrations</a></li>
      </ul>
    </li>
    <li>
      <a href="#usage">Usage</a>
      <ul>
        <li><a href="#portals">Portals</a></li>
        <li><a href="#scripts">Scripts</a></li>
        <li><a href="#android-apk-signing">Android APK Signing</a></li>
        <li><a href="#documentation">Documentation</a></li>
      </ul>
    </li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

---

## About The Project

DocuDash modernizes Philippine barangay document issuance (**Barangay Clearance**, **Certificate of Indigency**, **Certificate of Residency**, **Business Clearance**) by moving document intake, requirement verification, GCash/Cash payment tracking, and pickup scheduling online—eliminating long hall queues while preserving strict data privacy under the Philippine **Data Privacy Act of 2012 (Republic Act No. 10173)**.

The repository ships a unified **Expo / React Native** codebase targeting **Web / PWA**, **Android** (with automated release APK signing), and **iOS**, backed by **Supabase** (PostgreSQL, Auth, Storage, Realtime) and **Vercel Serverless Functions**.

### Key Capabilities

#### Resident Experience (Android, iOS, Web / PWA)
- **Self-service registration & RA 10173 consent:** Explicit, timestamped Data Privacy Act consent and Terms acceptance enforced both in the UI and at the PostgreSQL trigger level (`on_auth_user_created`).
- **Auto-assigned Philippine barangay & Google Maps hall locator:** Structured PSGC Region → Province → City/Municipality → Barangay picker automatically links residents to their barangay on registration and provides a **Locate Barangay Hall in Google Maps** shortcut.
- **Online document requests:** Browse active barangay documents with fees and required document checklists, submit a purpose, and upload requirement files (JPEG, PNG, WebP, PDF up to 5 MiB) into a private bucket.
- **GCash & Cash payment options:** Choose **Pay Now (GCash)**—with a **Download GCash QR** button, one-tap **Copy Number**, and receipt upload—or **Pay When Claiming (Cash at Counter)**.
- **Atomic pickup slot booking:** Reserve or re-book upcoming barangay counter time windows backed by row-level `SELECT ... FOR UPDATE` locking so slots can never be overbooked.
- **Live status tracking, notifications & QR pickup pass:** Real-time status updates (`pending` → `reviewing` → `ready` → `completed` / `rejected`), floating in-app toast banners, resident **Alerts** inbox, high-priority Android/iOS device alerts & pickup reminders (`expo-notifications`), browser/PWA alerts, email/Expo Push updates, and a vector QR pickup pass generated from a server-side 256-bit CSPRNG token.
- **Account self-service & privacy transparency:** Adaptive light/dark/system themes, in-app password reset & change password, device permission guides, Privacy Policy & Terms modals, and one-click **RA 10173 right-to-erasure** account deletion (`POST /api/delete-account`).

#### Barangay Staff & Admin Web Portal (Responsive Web & Mobile)
- **Role-guarded portal:** Persistent desktop sidebar (≥ 1024px) and adaptive mobile header restricted to `staff` and `admin` roles via Expo Router `Stack.Protected`, layout guards, and Postgres RLS.
- **Live FIFO queue & daily metrics:** Real-time request queue with status counts, today's pickup capacity progress bars, status filter pills, and resident/document search.
- **60-second signed requirement & payment proof viewer:** Inspect private resident IDs and GCash receipts via 60-second expiring signed URLs with a live countdown timer that clears previews on expiry and writes immutable `attachment_viewed` audit entries.
- **Workflow, payment verification & multi-channel notifications:** Enforce `pending` → `reviewing` → `ready` / `rejected` transitions, verify Cash or GCash payments via audited RPCs, release slots automatically on rejection, and notify residents via `/api/notify-resident` (Gmail SMTP / Resend email + Expo Push API + in-app Realtime).
- **Barangay Office & schedule management:** Configure Barangay Hall address/Google Maps coordinates, upload the official Barangay Treasury GCash QR image, manage pickup time windows/capacity, change account passwords, and scan QR passes via webcam (`jsqr`), native camera (`expo-camera`), or USB scanner (`POST /api/verify-pickup`).
- **Barangay Admin onboarding form:** Official barangay request form emailed to the platform administrator via `POST /api/request-barangay-admin`.

#### App Manager Control Plane
- **Strict exclusivity & RA 10173 isolation:** Accessible solely to the verified App Manager account (`APP_MANAGER_EMAIL`) via `Stack.Protected` routing and server-side JWT verification (`requireAppManager`).
- **Privacy-minimized governance:** Intentionally omits resident home addresses, phone numbers, uploaded IDs, request purposes, QR tokens, and payment proofs while allowing user role/barangay assignment, account erasure, approval of Barangay Admin requests (auto-creating accounts and emailing temporary passwords), barangay/document catalogue management, PII-free audit trail inspection, and 30-day RA 10173 attachment retention purges.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![Expo][Expo-badge]][Expo-url]
* [![React Native][ReactNative-badge]][ReactNative-url]
* [![TypeScript][TypeScript-badge]][TypeScript-url]
* [![TailwindCSS][Tailwind-badge]][Tailwind-url]
* [![Supabase][Supabase-badge]][Supabase-url]
* [![Vercel][Vercel-badge]][Vercel-url]
* [![Node.js][Node-badge]][Node-url]

| Layer | Technology |
| --- | --- |
| Client framework | Expo SDK 58, React Native 0.88, React 19.3 (React Compiler), Expo Router 58 (typed routes) |
| Language & styling | TypeScript (strict + `noUncheckedIndexedAccess`), NativeWind 4.2 (Tailwind CSS 3.4, adaptive light/dark/system themes) |
| Icons & device modules | `@expo/vector-icons/MaterialIcons`, `expo-camera`, `expo-notifications`, `expo-clipboard`, `expo-document-picker` |
| Database, Auth, Storage, Realtime | Supabase (PostgreSQL 17, Auth, private & public Storage buckets, Realtime `postgres_changes`) |
| Server API & Web Hosting | Vercel Static Export / PWA (`dist/` + `public/`) & Vercel Serverless Functions (`api/*.ts`) |
| Notifications & Email | Gmail/Custom SMTP (`nodemailer`), Resend Node.js SDK (`resend`), Expo Push API, Web Notification API |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Project Structure

```text
.
├── app/                         # Expo Router screens only (UI layer; zero direct Supabase calls)
│   ├── _layout.tsx              # AuthProvider, NotificationProvider, Stack.Protected role guards
│   ├── reset-password.tsx       # Cross-platform password recovery completion screen
│   ├── (auth)/                  # index, login, register (RA 10173 consent), barangay-admin-request
│   ├── (resident)/              # Resident tabs: index, request-new, profile, plus request/[id] tracker
│   ├── (admin)/                 # Staff portal: sidebar _layout, index, requests/[id], schedules, scanner, barangay
│   └── (manager)/               # App Manager portal (verified App Manager only): index, users, barangays, system
├── components/                  # Reusable UI primitives, modals, GcashPaymentDetails, PhilippineBarangayPicker, QrCodeMatrix/Scanner
├── contexts/                    # AuthContext, ThemeContext, NotificationContext, ManagerDataContext
├── constants/                   # Design tokens (theme.ts) and Asia/Manila/PHP formatters (format.ts)
├── services/                    # Client data access layer (only layer talking to Supabase anon key or /api)
│   ├── supabase.ts              # Lazy typed client, platform storage, ServiceError, callApi()
│   ├── authService.ts
│   ├── barangayService.ts
│   ├── locationService.ts       # PSGC Philippine geographic hierarchy API client
│   ├── managerService.ts
│   ├── notificationService.ts   # Native MAX-priority alerts, Web alerts, Expo Push token registration
│   ├── permissionService.ts
│   ├── requestService.ts
│   ├── scheduleService.ts
│   ├── storageService.ts
│   └── auditService.ts
├── api/                         # Server-only Vercel Serverless Functions (blocked from Metro bundle)
│   ├── _lib/                    # supabaseAdmin.ts, auth.ts, http.ts, smtp.ts, resend.ts, expoPush.ts, retentionPurge.ts
│   ├── app-manager.ts           # GET / POST /api/app-manager (verified App Manager only)
│   ├── delete-account.ts        # POST /api/delete-account (RA 10173 right to erasure)
│   ├── notify-resident.ts       # POST /api/notify-resident (Email + Expo Push dispatch)
│   ├── purge-attachments.ts     # POST /api/purge-attachments (30-day retention purge)
│   ├── request-barangay-admin.ts# POST /api/request-barangay-admin (public onboarding form)
│   └── verify-pickup.ts         # POST /api/verify-pickup (atomic QR verification)
├── plugins/                     # Expo config plugins (withAndroidReleaseSigning.js)
├── scripts/                     # Build/ops utilities (sign-apk.mjs automated keystore & APK signing)
├── public/                      # PWA manifest, web app shell, and app icons
├── supabase/migrations/         # Idempotent SQL migrations: 001_schema -> 006_push_tokens
├── types/                       # Shared Database TypeScript definitions & API contracts
└── docs/                        # Deep-dive documentation
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Getting Started

### Prerequisites

- **Node.js 20+** and **npm**
- A **Supabase** project ([supabase.com](https://supabase.com))
- **Optional:**
  - **Vercel CLI** (`npx vercel`) for testing `/api/*` locally and deploying web/API
  - **Gmail App Password** (recommended SMTP) or **Resend** account for email delivery
  - **JDK 17+** (`keytool`) & **Android SDK** (`apksigner`, `zipalign`) for local signed release APKs

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/HighOnKohi/DocuDash.git
   cd DocuDash
   ```
2. **Install dependencies**
   ```bash
   npm ci
   ```
3. **Copy environment template**
   ```bash
   cp .env.example .env.local
   ```
4. **Apply database migrations** in the Supabase SQL Editor (in order) and promote your first admin (details below).
5. **Start the local development server**
   ```bash
   npm run web         # Start Expo Web dev server
   npm start           # Start Expo dev server (Android / iOS / Web)
   ```

### Environment Variables

Populate `.env.local` (for local client runs) and **Vercel → Project Settings → Environment Variables**:

**Client-side (safe to bundle via `EXPO_PUBLIC_`):**
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `EXPO_PUBLIC_API_BASE_URL` — Leave empty on web (same origin); native builds default to `https://docu-dash-ph.vercel.app` when unset

**Server-only (Vercel only; NEVER prefix with `EXPO_PUBLIC_`):**
- `SUPABASE_URL` — Same Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key used inside `/api/*`
- `ALLOWED_ORIGINS` — Comma-separated CORS allow-list (`https://docu-dash-ph.vercel.app` is included by default)
- **Optional email delivery (SMTP preferred when set, Resend fallback):**
  - `SMTP_HOST` (e.g. `smtp.gmail.com`), `SMTP_PORT` (`465`), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `RESEND_TEMPLATE_ID`
- **Optional operations:**
  - `CRON_SECRET` (16+ random chars for `POST /api/purge-attachments`)
  - `APP_MANAGER_EMAIL` (verified App Manager account email)

### Database Migrations

Run the SQL migrations in order in the **Supabase SQL Editor**:
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_rpc_functions.sql`
4. `supabase/migrations/004_storage.sql`
5. `supabase/migrations/005_barangays_and_payments.sql`
6. `supabase/migrations/006_push_tokens.sql`

To promote an account registered through the app to a barangay administrator:
```sql
update public.profiles set role = 'admin' where id = '<user-uuid>';
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Usage

### Portals

| Role / Account | Route Group | Capabilities |
| --- | --- | --- |
| **Resident** | `/(resident)/(tabs)` | Submit document requests, download/pay GCash QR or pick Cash on pickup, track status & alerts, book counter pickup windows, display QR pickup pass, locate Barangay Hall in Google Maps |
| **Barangay Staff / Admin** | `/(admin)` | Review FIFO queue, verify uploaded requirements & payment proofs, manage Barangay Hall location & GCash QR, create pickup slots, scan/verify QR passes, dispatch notifications |
| **App Manager** | `/(manager)` | Approve Barangay Admin onboarding requests (auto-provisioning accounts & emailing temporary passwords), assign roles/barangays, manage document catalogue fees, trigger RA 10173 30-day attachment retention purges |

### Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start Expo dev server |
| `npm run web` | Start Expo Web dev server |
| `npm run android` / `npm run ios` | Launch local native dev build on Android or iOS |
| `npm run build:web` | Export static SPA/PWA web bundle to `dist/` |
| `npm run android:signing-setup` | Check or auto-generate release keystore & `credentials/keystore.properties` |
| `npm run android:sign-apk` | Sign & align an existing release APK with `zipalign` + `apksigner` |
| `npm run android:release` | Ensure signing credentials, build release APK via Gradle, and verify signature |
| `npm run typecheck` | Run TypeScript strict typecheck (`tsc --noEmit`) |
| `npm run lint` | Run ESLint (`expo lint`, including React Compiler rules) |
| `npm run doctor` | Run `npx expo-doctor` diagnostics |

### Android APK Signing

DocuDash includes [scripts/sign-apk.mjs](scripts/sign-apk.mjs) and [plugins/withAndroidReleaseSigning.js](plugins/withAndroidReleaseSigning.js) so sideloaded Android release APKs share a consistent cryptographic signature across upgrades without exposing keystore files in Git:

```powershell
# 1. Check or auto-generate gitignored credentials/docudash-release.jks & credentials/keystore.properties
npm run android:signing-setup

# 2. Build & sign the release APK (add --prebuild after native config changes)
npm run android:release
```

Back up your generated `credentials/` folder offline so future APK releases keep the same signing certificate.

### Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) — system diagrams, layering boundaries, role routing, Realtime, and QR workflows
- [Security & Privacy](docs/SECURITY.md) — complete RLS policy matrix, server-side guards, RA 10173 compliance, and threat mitigations
- [API & Database Reference](docs/API_AND_DB.md) — tables, triggers, RPCs, storage conventions, service layer, and `/api/*` endpoints
- [Deployment Guide](docs/DEPLOYMENT.md) — Supabase, Vercel, PWA, Android APK signing, and EAS native build setup
- [Email Templates](docs/EMAIL_TEMPLATES.md) — DocuDash-branded Supabase Auth email HTML templates
- [Project Master Tracker](PROJECT.md) — phase-by-phase build log, file inventory, and audit verification record

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Roadmap

- [x] Core resident & barangay staff document pre-processing workflows with atomic pickup slots & CSPRNG QR passes
- [x] Adaptive light/dark/system themes and mobile/web responsive layouts
- [x] Multi-barangay auto-assignment via Philippine PSGC API & Google Maps hall locator
- [x] Barangay GCash QR (downloadable QR + copy number) & Cash counter payment verification
- [x] High-priority in-app/OS/browser Ready-for-Pickup alerts, Expo Push dispatch, and RA 10173 self-service erasure
- [x] Exclusive RA 10173–minimized App Manager control plane & automated admin credential emails
- [x] Automated local Android release keystore setup & APK signing (`scripts/sign-apk.mjs`)
- [ ] Play Store / App Store distribution & FCM/APNs background push credentials for closed-app notifications
- [ ] Multi-language localization (Tagalog / Cebuano / Ilocano)

See the [open issues](https://github.com/HighOnKohi/DocuDash/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contributing

Contributions are welcome and help improve digital public service tooling for Philippine barangays. Please follow the architecture and linting rules in `AGENTS.md` (run `npm run typecheck` and `npm run lint` before opening a PR).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Top Contributors

<a href="https://github.com/HighOnKohi/DocuDash/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=HighOnKohi/DocuDash" alt="contrib.rocks image" />
</a>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contact

- Live Portal: [https://docu-dash-ph.vercel.app](https://docu-dash-ph.vercel.app)
- Project Repository: [https://github.com/HighOnKohi/DocuDash](https://github.com/HighOnKohi/DocuDash)
- Bug Reports & Feature Requests: [GitHub Issues](https://github.com/HighOnKohi/DocuDash/issues)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Acknowledgments

- [Expo](https://expo.dev/) & [Expo Router](https://docs.expo.dev/router/introduction/)
- [Supabase](https://supabase.com/)
- [NativeWind](https://www.nativewind.dev/) & [Tailwind CSS](https://tailwindcss.com/)
- [PSGC Cloud API](https://psgc.cloud/)
- [Vercel](https://vercel.com/)
- [Img Shields](https://shields.io/)
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) by Othneil Drew

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- Markdown link definitions -->
[contributors-shield]: https://img.shields.io/github/contributors/HighOnKohi/DocuDash.svg?style=for-the-badge
[contributors-url]: https://github.com/HighOnKohi/DocuDash/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/HighOnKohi/DocuDash.svg?style=for-the-badge
[forks-url]: https://github.com/HighOnKohi/DocuDash/network/members
[stars-shield]: https://img.shields.io/github/stars/HighOnKohi/DocuDash.svg?style=for-the-badge
[stars-url]: https://github.com/HighOnKohi/DocuDash/stargazers
[issues-shield]: https://img.shields.io/github/issues/HighOnKohi/DocuDash.svg?style=for-the-badge
[issues-url]: https://github.com/HighOnKohi/DocuDash/issues
[license-shield]: https://img.shields.io/github/license/HighOnKohi/DocuDash.svg?style=for-the-badge
[license-url]: https://github.com/HighOnKohi/DocuDash/blob/main/LICENSE
[Expo-badge]: https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white
[Expo-url]: https://expo.dev/
[ReactNative-badge]: https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[ReactNative-url]: https://reactnative.dev/
[TypeScript-badge]: https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Tailwind-badge]: https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Supabase-badge]: https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white
[Supabase-url]: https://supabase.com/
[Vercel-badge]: https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white
[Vercel-url]: https://vercel.com/
[Node-badge]: https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white
[Node-url]: https://nodejs.org/
