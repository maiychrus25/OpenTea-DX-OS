---
stepsCompleted: ["step-01", "step-02", "step-03"]
inputDocuments:
  - _bmad-output/planning-artifacts/prd-dx-agrimarket-20260804/prd.md
  - _bmad-output/planning-artifacts/architecture-dx-agrimarket-20260804/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-OpenTea-DX-OS-20260804/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-OpenTea-DX-OS-20260804/EXPERIENCE.md
---

# OpenTea-DX-OS — Epic & Story Breakdown

## Overview

This document provides the complete epic and story breakdown for OpenTea-DX-OS (DX-AgriMarket Agri-OS), decomposing all requirements from the PRD, Architecture Spine, and UX Design Contract into implementable stories. Each story is sized for completion by a single developer agent in one context window (2–4 hours). Stories are ordered so that no story depends on a future story within the same epic.

**Timeline:** 04/08 – 30/08/2026 (POF submission) · 10/09/2026 (final)
**Team:** 3 developers, full-stack across all features
**Strategy:** 6 epics (Option C) — large thematic epics with very small, independently completable stories inside each.

---

## Requirements Inventory

### Functional Requirements

FR-H1: Keycloak auth + WebAuthn Passkeys + PIN fallback + 3-role routing
FR-H2: HTX Profile CRUD + auto-aggregate area from Farm Zone
FR-A1: Daily Market Bulletin (n8n + Ollama synthesis) + TTS listen button
FR-A2: Smart Notification — Web Bell + n8n Mattermost push connector
FR-A3: Market Expert Chatbot (Ollama RAG from PostgreSQL, streaming)
FR-B1: Agricultural Partner Map CRUD (Leaflet + Nominatim geocode)
FR-B2: Farm Zone Map read-only view for Manager (filter by status + crop)
FR-B3: Broadcast Announcement (Manager → all Officers + Farmers)
FR-B4: Lot List read-only for Manager + deep-link from notification
FR-B5: HTX Capability Profile Page (public storefront, auto-generated)
FR-C1: Farm Zone Map full CRUD for Officer (households + parcels + polygon draw)
FR-C2: Digital Farming Journal (Officer self-record + batch approve + weather auto-attach)
FR-C3: QR Code Traceability 6-step workflow + public scan page
FR-C4: P.A.R.A Document Management (MinIO PARA folder structure)
FR-C5: Technical Expert Chatbot (RAG from MinIO documents)
FR-C6: Technical Announcement to Farmers (Officer → specific households)
FR-D1: "Today" Dashboard — role-scoped (Manager / Officer / Farmer)
FR-E1: Notification System (Web Bell SSE + n8n Mattermost push)
FR-F1: AI-Powered Disease Diagnosis (FastAPI TF/Keras + Farmer UI + PWA offline)
FR-G1: Farmer Journal Entry (self-record + pending/withdraw + Officer batch approve)

### NonFunctional Requirements

NFR-1: Ollama chatbot response < 10s (demo server CPU-only Mistral 7B); < 5s GPU; ~3-5s local Phi-3
NFR-2: Open-Meteo polled by n8n every 1h; stored to PostgreSQL; no direct client calls
NFR-3: Leaflet renders 200+ parcel polygons without UI freeze
NFR-4: Public QR scan page load < 2 seconds (static render from pre-generated data)
NFR-5: Piper TTS on-demand for MVP; nightly cronjob post-30/8
NFR-6: Docker Compose self-hosted; each service independently restartable
NFR-7: Ollama unavailable → bulletin shows raw data; Piper unavailable → hide TTS button
NFR-8: PWA cache for disease photo + GPS snapshot; auto-upload on reconnect
NFR-9: Keycloak + WebAuthn; zero SMS cost
NFR-10: Role-based authorization enforced server-side via middleware; no client-side role check
NFR-11: Farmer accesses only own parcel data; Officer accesses all HTX data
NFR-12: MinIO internal network only; pre-signed URLs for all client downloads
NFR-13: TTS "Nghe" button on: Dashboard, Notifications, Diagnosis result, Market Bulletin
NFR-14: All UI in Vietnamese; all AI output in Vietnamese with international source citations

### Additional Requirements

- AD-1/AD-15: Hexagonal Architecture — 4 mandatory layers: route.ts → UseCase → Domain Core ← Infrastructure Adapter
- AD-2: Monorepo structure — apps/web (Next.js) + apps/disease-api (FastAPI)
- AD-3: Next.js App Router; Server Components default; 'use client' only when needed
- AD-4: Prisma ORM schema-first at apps/web/prisma/schema.prisma
- AD-6: CSS Modules; design tokens in styles/globals.css; no Tailwind; no inline styles
- AD-7: Keycloak OIDC middleware protects /(manager)/, /(officer)/, /(farmer)/
- AD-8: Ollama + FastAPI called from API routes only; model switch via OLLAMA_MODEL env var
- AD-9: n8n is sole owner of external data ingestion (World Bank/WTO/NASA/Open-Meteo/ExchangeRate)
- AD-10: All Leaflet components use dynamic import with ssr: false; Nominatim proxied via /api/geocode
- AD-11: Notifications stored in PostgreSQL; Web Bell via SSE endpoint
- AD-12: MinIO via pre-signed URLs only; no MinIO SDK in client components
- AD-13: GitHub Flow; branch naming feat/N-slug; Conventional Commits
- AD-14: .env.example committed; secrets never committed; 3 environments
- AD-18: Feature-based folder — _components/ co-located; shared → components/ui/
- AD-19: n8n workflows exported as JSON to /workflows/

### UX Design Requirements

UX-DR1: 25+ color tokens in globals.css CSS custom properties (primary green #16A34A, accent orange #EA580C, 4-status-set, semantic colors, neutrals)
UX-DR2: Inter typeface via Google Fonts; 9-level typography scale; [data-role="farmer"] → body-large (17px) via layout root
UX-DR3: Farmer role: single-column layout, bottom nav (Today / Nhật ký / Chẩn đoán), no sidebar
UX-DR4: Manager/Officer: sidebar 240px fixed on desktop + bottom nav on mobile; data-role drives layout
UX-DR5: StatusBadge component: closed 5-variant set (Sowing/Tending/Harvest-Approved/Harvested/Draft)
UX-DR6: NotificationBell: SSE real-time count; overlay dropdown panel; mark-all-read; not page navigation
UX-DR7: TTS Button: hidden (not disabled) when Piper unavailable; playing state with stop icon; concurrent audio stops previous
UX-DR8: ChatWidget: word-by-word streaming; citation footer mandatory below each AI bubble; stop button during stream
UX-DR9: WithdrawalStatusBlock: left-border card; PASSED = green border + show Approve button; NOT YET = amber + hide button
UX-DR10: LotWorkflowStepper: 6-step non-clickable stepper; Export QR disabled until weight + spec filled
UX-DR11: JournalEntryForm: Spraying → conditional fields animate in 150ms; weather auto-fetch on date blur
UX-DR12: BatchApprovePanel: sticky bottom bar "Approve N selected"; Shift+click multi-select; per-row progress on approve
UX-DR13: Map polygon fills: 40% opacity fill + 100% stroke per status color; not full-opacity
UX-DR14: AI citation microcopy invariant: every AI content block ends with "(Nguồn: [SOURCE], [DD/MM/YYYY])"
UX-DR15: 20 state patterns: skeleton loading (not spinner-only), empty states with CTA, error banners inline
UX-DR16: Minimum 44×44px tap targets on all interactive mobile elements
UX-DR17: ARIA: aria-live for notification badge, StatusBadge, chat stream; focus trap in modals/drawers
UX-DR18: prefers-reduced-motion: disable skeleton pulse, disable slide animations
UX-DR19: PWA offline flow for disease diagnosis: cache photo + GPS on capture; auto-submit on reconnect; offline banner
UX-DR20: Public QR Scan page: 4 collapsible blocks; max-width 640px centered; print-friendly CSS; no auth chrome

### FR Coverage Map

FR-H1 → Epic 1 — Keycloak auth setup, login page, role middleware, role-based layouts
FR-H2 → Epic 1 — HTX Profile page, auto-aggregate area
FR-A1 → Epic 2 — Market Bulletin page + n8n synthesis workflow + TTS button
FR-A3 → Epic 2 — Market Expert Chatbot (Ollama RAG streaming)
FR-B1 → Epic 2 — Agricultural Partner Map CRUD (Leaflet + Nominatim)
FR-B2 → Epic 2 — Farm Zone read-only view for Manager
FR-E1 (Web Bell) → Epic 2 — Web Bell SSE + NotificationPanel
FR-C1 → Epic 3 — Farm Zone Map full CRUD for Officer (households + parcels)
FR-C2 → Epic 3 — Digital Farming Journal + batch approve + weather auto-attach
FR-C6 → Epic 3 — Technical Announcement to Farmers
FR-C3 → Epic 4 — QR Traceability 6-step workflow + public scan page
FR-F1 (backend) → Epic 4 — FastAPI Disease Detection service + Docker integration
FR-B4 → Epic 4 — Lot List read-only for Manager + deep-link
FR-D1 → Epic 5 — Today Dashboard (Manager / Officer / Farmer roles)
FR-F1 (Farmer UI) → Epic 5 — Disease Diagnosis Farmer UI + PWA offline
FR-G1 → Epic 5 — Farmer Journal self-submission + pending/withdraw flow
FR-B3 → Epic 5 — Broadcast Announcement (Manager)
FR-E1 (full) → Epic 5 — Mattermost n8n push + weekly officer reminder cronjob
FR-A2 → Epic 5 — Smart Notification full (AI-evaluated importance)
FR-C4 → Epic 6 — P.A.R.A Document Store (MinIO PARA)
FR-C5 → Epic 6 — Technical Expert Chatbot (RAG from MinIO)
FR-B5 → Epic 6 — HTX Capability Profile public page
UX-DR1–4 → Epic 1 — Design system foundation (tokens, typography, layout shells)
UX-DR5–8,13–18 → Distributed across Epics 2–5 (per feature implementation)
UX-DR9–12 → Epics 3–4 (Farm Zone, Journal, QR workflow)
UX-DR19–20 → Epic 4–5 (PWA, QR public page)

---

## Epic List

### Epic 1: Foundation — Infrastructure, Auth & Design System
Users across all three roles can log in securely via Passkeys or PIN, are routed to their role-specific UI, and the entire codebase has a unified design system (tokens, shared components, layout shells). HTX managers can set up the cooperative profile. n8n data pipelines automatically ingest international market data into PostgreSQL every hour/day.
**FRs covered:** FR-H1, FR-H2
**ARs covered:** AD-1,2,3,4,6,7,9,13,14,15,18,19
**UX-DRs covered:** UX-DR1, UX-DR2, UX-DR3, UX-DR4

### Epic 2: Market Intelligence — Bulletin, Chatbot & Partner Map
HTX Manager can read a Vietnamese-language daily market bulletin with TTS audio, ask a chatbot about prices in Vietnamese with cited international data, and manage a buyer/middleman partner map — everything needed to walk into a price negotiation informed.
**FRs covered:** FR-A1, FR-A3, FR-B1, FR-B2, FR-E1 (Web Bell basic)
**UX-DRs covered:** UX-DR5, UX-DR6, UX-DR7, UX-DR8, UX-DR13, UX-DR14, UX-DR15, UX-DR16, UX-DR17, UX-DR18

### Epic 3: Farm Zone Management & Digital Journal
Technical Officer can map the full HTX farm zone (households + parcels with polygon drawing), record daily farming activities with weather auto-attachment, and batch-approve weekly farmer-submitted journal entries — the data foundation for QR traceability.
**FRs covered:** FR-C1, FR-C2, FR-C6
**UX-DRs covered:** UX-DR5, UX-DR9, UX-DR11, UX-DR12, UX-DR13, UX-DR15, UX-DR16, UX-DR17

### Epic 4: QR Traceability & Disease Detection Backend
Technical Officer can generate product-origin QR codes from parcels with harvest-approved status (≥95% auto-fill), buyers can scan the public QR page to see full cultivation history, and the AI disease detection FastAPI service is deployed and ready for the Farmer UI in Epic 5.
**FRs covered:** FR-C3, FR-F1 (backend only), FR-B4
**UX-DRs covered:** UX-DR9, UX-DR10, UX-DR15, UX-DR20

### Epic 5: Farmer Experience & Full Notification System
Farmers have their own role-specific tools: a Today dashboard with weather + prices, disease photo diagnosis with PWA offline support, self-service journal submission, and personal notification inbox. The full notification pipeline (Mattermost push via n8n, weekly officer reminders) goes live for all actors.
**FRs covered:** FR-D1, FR-F1 (Farmer UI), FR-G1, FR-B3, FR-E1 (full), FR-A2
**UX-DRs covered:** UX-DR3, UX-DR6, UX-DR7, UX-DR15, UX-DR16, UX-DR17, UX-DR18, UX-DR19

### Epic 6: Document Store, Technical Chatbot & Public Storefront
Technical Officer can manage cultivation documents in a MinIO P.A.R.A store and ask an agronomy chatbot that references internal documents. HTX Manager can share a public capability page listing all export-ready lots with a single URL.
**FRs covered:** FR-C4, FR-C5, FR-B5
**UX-DRs covered:** UX-DR8, UX-DR14, UX-DR15, UX-DR17

---

## Epic 1: Foundation — Infrastructure, Auth & Design System

Users across all three roles can log in securely; the cooperative profile is configured; n8n pipelines pull live international data; and every UI component shares a coherent design system.

### Story 1.1: Monorepo Structure & Docker Compose Stack

As a developer,
I want the full project skeleton and all Docker services running locally,
So that every team member has a reproducible environment to start work.

**Acceptance Criteria:**

**Given** the repository is cloned on a fresh machine
**When** `docker compose up` is run from the `docker/` directory
**Then** all 8 services start and pass health checks: `web` (3000), `postgres` (5432), `keycloak` (8080), `n8n` (5678), `ollama` (11434), `piper` (5500), `minio` (9000/9001), `disease-api` (8000)
**And** startup order respects depends_on: postgres → keycloak → web; postgres → n8n; ollama → web (health check)
**And** `apps/web/`, `apps/disease-api/`, `docker/`, `workflows/`, `docs/`, `ai-models/` directories exist per AD-2
**And** `.env.example` contains all required env vars (OLLAMA_MODEL, DATABASE_URL, NEXTAUTH_SECRET, KEYCLOAK_CLIENT_ID/SECRET/ISSUER, MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY, DISEASE_API_URL)
**And** `.gitignore` excludes `.env.local`, `.env.staging`, `.env.production`, `ai-models/`, `node_modules/`, `.next/`, `__pycache__/`, `apps/disease-api/.venv/`
**And** `apps/web/` is a Next.js 14 App Router project with TypeScript strict mode enabled

---

### Story 1.2: Design System — CSS Tokens & Shared Layout Components

As a developer,
I want the design token system and shared layout components in place,
So that all feature components can reference consistent colors, typography, spacing, and layouts without ad-hoc styles.

**Acceptance Criteria:**

**Given** the Next.js app is running
**When** any page renders
**Then** `apps/web/src/styles/globals.css` exports all CSS custom properties: primary (#16A34A), primary-hover, primary-subtle, primary-foreground, accent (#EA580C), accent-hover, accent-subtle, 4 parcel status colors (status-sowing/tending/harvest-approved/harvested), 8 semantic feedback colors, 5 neutral surface/border/ink tokens, map-overlay, badge-unread
**And** Inter font is loaded via Google Fonts (preconnect + display=swap)
**And** `[data-role="farmer"]` on the layout root applies `--font-size-body: 1.0625rem` (17px) inherited by all child elements
**And** `AppShell.tsx` renders sidebar (240px, desktop) + content area; collapses to bottom nav on mobile (< 1024px)
**And** `Sidebar.tsx` accepts a `navItems` prop and renders active state using primary-subtle background + primary text color
**And** `TopBar.tsx` renders project logo + role label + notification bell placeholder + user avatar
**And** `RoleGuard.tsx` redirects to `/unauthorized` when the session role does not match the route prefix
**And** shared UI components exist at `components/ui/`: `Button` (variants: primary/accent/ghost/danger), `Card`, `Badge` (5 status variants), `Modal` (focus-trapped), `Skeleton` (respects prefers-reduced-motion)
**And** every component has its own `.module.css` co-located file; no inline styles; no Tailwind classes

---

### Story 1.3: Database Schema & Prisma Setup

As a developer,
I want the complete Prisma schema and initial migration applied,
So that all domain entities are defined once and all subsequent features can use Prisma Client without schema conflicts.

**Acceptance Criteria:**

**Given** the `postgres` Docker service is running
**When** `npx prisma migrate deploy` is run inside the `web` container
**Then** the migration applies successfully and all tables exist in PostgreSQL: `HtxProfile`, `Household`, `Parcel`, `ParcelCropCycle`, `JournalEntry`, `JournalActivity`, `Lot`, `Notification`, `DiseaseReport`, `MarketData`, `Bulletin`, `FxRate`, `WeatherCache`, `Partner`, `ChatHistory`
**And** `apps/web/prisma/schema.prisma` defines all models with correct field types, relations, and constraints matching `docs/database-schema.md`
**And** `infrastructure/db/prisma.client.ts` exports a singleton Prisma Client instance
**And** `npx prisma generate` produces typed client with no TypeScript errors
**And** a seed script at `prisma/seed.ts` inserts: 1 HtxProfile (MD2 - Mekong Delta sample), 3 Households, 5 Parcels, 5 sample Partner records for the partner map demo

---

### Story 1.4: Hexagonal Architecture Scaffolding

As a developer,
I want the domain/application/infrastructure folder structure and base patterns established,
So that all feature stories follow the same hexagonal pattern without debating structure.

**Acceptance Criteria:**

**Given** the `apps/web/src/` directory
**When** a developer looks at the folder structure
**Then** the following directories exist with placeholder index files: `domain/bulletin/`, `domain/journal/`, `domain/lot/`, `domain/farm/`, `domain/notification/`, `domain/disease/`, `domain/shared/value-objects/`, `domain/shared/errors/`
**And** `application/bulletin/`, `application/journal/`, `application/lot/`, `application/farm/`, `application/disease/`, `application/notification/` directories exist
**And** `infrastructure/db/` contains `prisma.client.ts` (from Story 1.3); `infrastructure/ai/`, `infrastructure/tts/`, `infrastructure/storage/`, `infrastructure/qr/`, `infrastructure/disease-api/`, `infrastructure/notification-channels/` directories exist
**And** a reference route handler at `app/api/health/route.ts` demonstrates the standard pattern: Zod validate → instantiate adapter → inject into UseCase → return NextResponse.json
**And** `lib/validations/` directory exists for Zod schema definitions
**And** TypeScript `noUnusedLocals: true` and `strict: true` are set in `tsconfig.json`

---

### Story 1.5: Keycloak Configuration & Authentication

As a user (any role),
I want to log in using a Passkey (fingerprint/Face ID) or a 6-digit PIN,
So that I can access my role-specific dashboard securely without a password.

**Acceptance Criteria:**

**Given** Keycloak is running at port 8080
**When** the Keycloak realm `agrimarket` is set up
**Then** the realm has 3 client roles: `manager`, `officer`, `farmer`
**And** WebAuthn (Passkeys) is enabled as a primary authentication factor in the realm
**And** Phone number + 6-digit PIN is configured as a fallback flow
**And** NextAuth.js v5 is configured with the Keycloak OIDC provider in `app/api/auth/[...nextauth]/route.ts`
**And** the session includes `user.role` extracted from the Keycloak token `realm_access.roles`

**Given** a user navigates to `/login`
**When** they authenticate successfully
**Then** they are redirected to their role's dashboard: manager → `/manager/dashboard`, officer → `/officer/dashboard`, farmer → `/farmer/dashboard`

**Given** Next.js middleware at `middleware.ts`
**When** a request hits `/(manager)/`, `/(officer)/`, or `/(farmer)/` with a mismatched role
**Then** the request is redirected to `/unauthorized` immediately without rendering the page

---

### Story 1.6: HTX Profile Page

As an HTX Manager,
I want to set up and view the cooperative's profile (name, address, registered crop types, total area),
So that the system knows which crops to focus bulletin and notification content on.

**Acceptance Criteria:**

**Given** the Manager is authenticated and navigates to their profile section
**When** the HTX Profile page loads
**Then** it displays: HTX name, address, registered crop types (multi-select), current season label, and total cultivated area (auto-aggregated from parcels or 0 if no parcels yet)
**And** the Manager can edit all fields via an inline form and save with a primary green "Lưu" button
**And** saving triggers `PUT /api/htx-profile` which validates with Zod, calls `UpdateHtxProfileUseCase`, and returns the updated profile

**Given** crop types are set in HTX Profile
**When** the bulletin pipeline runs (Epic 2)
**Then** bulletin content is filtered to show only registered crop types

**Given** no HTX Profile exists yet
**When** the Manager first logs in
**Then** an onboarding prompt appears: "Hãy thiết lập thông tin HTX để bắt đầu." with a [Thiết lập ngay] button linking to the profile page

---

### Story 1.7: n8n Data Pipeline — Market Data Ingestion

As an HTX Manager,
I want global market data (World Bank commodity prices, WTO tariffs, exchange rates, NASA climate data) to be automatically fetched and stored daily,
So that the bulletin and chatbot always have fresh, cited source data available.

**Acceptance Criteria:**

**Given** n8n is running and workflows are imported from `/workflows/`
**When** the `market-data-ingestion.json` workflow triggers (cron: every 6h)
**Then** it fetches World Bank → inserts into `market_data` table with source, commodity, metric, value, unit, period, fetched_at
**And** it fetches WTO Tariff + FAOSTAT → inserts into `market_data` with appropriate source tags
**And** it fetches NASA POWER climate data → inserts into `market_data`
**And** all inserts use `ON CONFLICT (source, commodity, metric, period) DO UPDATE` for idempotency
**And** the `fx-rates-sync.json` workflow (cron: every 24h) fetches ExchangeRate-API rates -> inserts into `fx_rates` as JSONB
**And** the `weather-sync.json` workflow (cron: every 1h) fetches Open-Meteo for all parcel centroid coordinates → upserts into `weather_cache` per parcel
**And** each workflow has an Error Trigger node that logs failures to the `notifications` table with `type='system'`
**And** all workflow JSON files are committed to `/workflows/` directory

---

## Epic 2: Market Intelligence — Bulletin, Chatbot & Partner Map

HTX Manager can read daily market intelligence with TTS, chat with an AI market advisor using cited international data, and manage a partner contact map — everything needed to prepare for price negotiations.

### Story 2.1: Market Data API Endpoint

As a developer (enabling the bulletin and chatbot features),
I want a typed API endpoint that reads market data from PostgreSQL,
So that bulletin and chatbot pages have a reliable, tested data layer to query from.

**Acceptance Criteria:**

**Given** `market_data` and `fx_rates` tables are populated by n8n (from Story 1.7)
**When** `GET /api/market-data?commodity=rice&limit=10` is called with a valid Manager session
**Then** it returns `{ data: MarketData[], meta: { total } }` with correct TypeScript types
**And** the response includes `fetched_at` timestamp and `source` field for each record
**And** unauthorized requests return `{ error: { code: 'UNAUTHORIZED', message: '...' } }` with HTTP 401
**And** the route handler follows hexagonal pattern: Zod validate query params → `GetMarketDataUseCase` → `PrismaMarketDataRepository` → response
**And** a `GET /api/market-data/fx-rate` endpoint returns the latest rates from `fx_rates` JSONB

---

### Story 2.2: Daily Market Bulletin — Display Page

As an HTX Manager,
I want to read today's AI-synthesized Vietnamese market bulletin on my dashboard,
So that I have up-to-date price and supply-demand intelligence before any negotiation.

**Acceptance Criteria:**

**Given** the bulletin synthesis n8n workflow has run (Story 2.3)
**When** the Manager navigates to `/manager/bulletin`
**Then** the page renders the latest `bulletins` record for each registered crop type
**And** each `BulletinCard` displays: commodity name, bulletin text in Vietnamese, key data points, source citations in `mono` typeface as "(Nguồn: World Bank, DD/MM/YYYY)"
**And** the page title uses `display` typography (32px, 700 weight)
**And** if no bulletin exists yet, a skeleton card with "Đang tổng hợp bản tin..." placeholder is shown (not a spinner)
**And** if Ollama is unavailable, raw market data is displayed in a table with a banner: "Không thể kết nối máy chủ AI. Hiển thị dữ liệu thô."
**And** the page is a Server Component that fetches via `GetLatestBulletinUseCase`

---

### Story 2.3: Bulletin TTS "Nghe" Button

As an HTX Manager,
I want to tap a "Nghe" button to hear a 30-second audio summary of the bulletin,
So that I can consume market intelligence while doing other tasks (e.g., making coffee before a meeting).

**Acceptance Criteria:**

**Given** the Manager is on the bulletin page
**When** they tap the "Nghe" button (green-tinted pill, speaker-wave icon)
**Then** the browser calls `POST /api/tts` with the bulletin summary text
**And** the Piper TTS service generates audio (vi_VN-vais1000-medium voice) and returns the audio stream
**And** the button transitions to a "playing" state (stop icon) while audio plays
**And** tapping again stops playback and returns to idle state
**And** starting new audio on another bulletin card stops any currently playing audio

**Given** Piper TTS is unavailable
**When** the bulletin page loads
**Then** the "Nghe" button is hidden entirely (not disabled, not grayed) — no error message shown

**Given** a request to `/api/tts`
**When** the route handler processes it
**Then** it calls `PiperTtsAdapter` (infrastructure layer); Domain core has no TTS dependency
**And** the route validates request body with Zod (text field required, max 500 chars)

---

### Story 2.4: n8n Bulletin Synthesis Workflow

As an HTX Manager,
I want the bulletin to be generated automatically each morning without any manual action,
So that fresh intelligence is always waiting when I start my day.

**Acceptance Criteria:**

**Given** market_data and fx_rates tables have data
**When** the `bulletin-synthesis.json` n8n workflow triggers at 04:00 daily
**Then** it queries PostgreSQL for market_data WHERE commodity matches HTX profile crop types AND fetched_at > NOW() - 48h
**And** it queries fx_rates for the latest rates JSONB
**And** it builds a RAG context string with citations (source, metric, value, unit, period)
**And** it sends an HTTP request to Ollama `/api/chat` with: model = `{{ $env.OLLAMA_MODEL }}`, system prompt containing all 4 AI invariant rules (cite sources, no decisions, no recommendations, all numbers cited)
**And** it saves the Ollama response to the `bulletins` table with: commodity, bulletin_vi, sources_json, model_used, is_latest=true
**And** it sets is_latest=false on the previous bulletin for the same commodity before inserting
**And** the workflow JSON is committed to `/workflows/bulletin-synthesis.json`

---

### Story 2.5: Market Expert Chatbot

As an HTX Manager,
I want to ask market price questions in Vietnamese and receive AI responses with data citations,
So that I can get specific price intelligence (e.g., "Is 12,000 VND/kg for ST25 rice fair?") before negotiating.

**Acceptance Criteria:**

**Given** the Manager navigates to `/manager/chatbot`
**When** they type a question and press Send (or Enter)
**Then** the message appears in a right-aligned green chat bubble
**And** a `POST /api/chatbot` request is sent with the user message and chat session ID
**And** the API route queries PostgreSQL for relevant market_data, constructs a RAG context, and calls Ollama streaming API
**And** the AI response streams word-by-word into a left-aligned sunken-surface chat bubble with animated cursor
**And** a "Stop" button is visible during streaming; clicking it terminates the stream and shows the partial response
**And** each AI response bubble has a mandatory citation footer below in `meta` + `mono` style showing data sources and dates
**And** the chatbot only answers market/price topics; for out-of-scope questions it responds: "Câu hỏi này nằm ngoài phạm vi hỗ trợ của tôi (giá thị trường, cung cầu). Vui lòng hỏi Cán bộ KT về kỹ thuật canh tác."
**And** chat history is stored in `chat_history` table; the Manager can scroll up to see the past 7 days of conversations

**Given** Ollama is unavailable
**When** the Manager opens the chatbot page
**Then** the input is disabled and a banner displays: "Máy chủ AI đang tạm dừng. Vui lòng thử lại sau."

---

### Story 2.6: Agricultural Partner Map CRUD

As an HTX Manager,
I want to view, add, edit, and delete buyer, middleman, and warehouse contacts on an interactive map,
So that I can quickly find partner contacts and plan who to approach when I have produce to sell.

**Acceptance Criteria:**

**Given** the Manager navigates to `/manager/partner-map`
**When** the page loads
**Then** a full-screen Leaflet map renders (dynamic import, ssr: false) with OpenStreetMap base layer
**And** all Partner records from the database are shown as markers: Buyer/Middleman (person icon), Warehouse (building icon)
**And** clicking a marker opens a popup showing: name, type, contact phone, primary commodities, [Chỉnh sửa] [Xóa] buttons

**Given** the Manager clicks [Thêm đối tác]
**When** they type an address in the search input (300ms debounce → Nominatim via `/api/geocode`)
**Then** autocomplete suggestions appear; selecting one pins the map to that location
**And** the add-partner form collects: name, type (Buyer/Middleman/Warehouse), contact, primary commodities, and the geocoded coordinates
**And** submitting creates a new Partner via `POST /api/partners`

**Given** the Manager clicks [Xóa] on a partner popup
**When** a confirmation modal appears ("Xóa đối tác [name]?")
**Then** confirming calls `DELETE /api/partners/[id]` and removes the marker from the map
**And** the map renders 200+ markers without UI freeze (NFR-3 applies to this use case)

---

### Story 2.7: Web Bell Notification System (MVP)

As any authenticated user,
I want a notification bell in the header that shows unread notification count in real time and lets me view my messages,
So that I never miss important system events (harvest approvals, disease reports, market alerts).

**Acceptance Criteria:**

**Given** any authenticated user is on any page
**When** the TopBar renders
**Then** the `NotificationBell` component displays a bell icon with a red badge showing unread count (hidden when count = 0)
**And** the count is updated in real time via `GET /api/notifications/stream` (SSE connection)
**And** clicking the bell opens a right-anchored overlay panel (not a page navigation)
**And** the panel shows the 20 most recent notifications, newest first, each with: icon, title, timestamp, [Nghe] TTS button
**And** a "Đánh dấu tất cả đã đọc" button at the top marks all as read; badge count resets to 0
**And** clicking a notification that has a `deep_link_url` navigates to that page and closes the panel

**Given** a new notification is inserted into the `notifications` PostgreSQL table
**When** the SSE connection is active
**Then** the unread count in the bell badge updates within 3 seconds without page refresh

**Given** `[data-role="farmer"]` is set
**When** a notification item has TTS content and Piper is available
**Then** the [Nghe] button is visible and plays the notification text via `/api/tts`

---

### Story 2.8: Farm Zone Map — Read-Only View for Manager

As an HTX Manager,
I want to view the full farm zone map with all parcels color-coded by status,
So that I have a visual overview of the cooperative's cultivation progress and can plan negotiations based on harvest timelines.

**Acceptance Criteria:**

**Given** the Manager navigates to `/manager/farm-zone`
**When** parcels exist in the database (created by Officer in Epic 3)
**Then** the Leaflet map renders all parcels as color-coded polygons at 40% opacity fill: Sowing=green, Tending=amber, Harvest-Approved=orange, Harvested=blue
**And** a filter panel allows filtering by parcel status (multi-select checkboxes) AND crop type simultaneously
**And** clicking a parcel polygon shows a popup with: parcel code, household name, crop type, current status badge, area (ha)
**And** there are NO add/edit/delete controls — the map is strictly read-only for Manager role
**And** the page renders as a separate route `/manager/farm-zone`, not combined with Partner Map

**Given** no parcels exist yet
**When** the Manager opens the farm zone page
**Then** the base map renders with an overlay card: "Chưa có thửa đất nào. Cán bộ KT sẽ thiết lập vùng trồng."

---

## Epic 3: Farm Zone Management & Digital Journal

Technical Officer can map the full HTX farm zone, record daily farming activities with weather auto-attachment, and batch-approve weekly farmer journal entries — the complete data foundation that QR traceability depends on.

### Story 3.1: Household Management (Officer)

As a Technical Officer,
I want to add, edit, and delete member farming households,
So that every parcel can be linked to its responsible member household when I set up the farm zone.

**Acceptance Criteria:**

**Given** the Officer navigates to `/officer/farm-zone`
**When** the page loads
**Then** a sidebar panel lists all existing Households with name and phone, plus an [Thêm hộ nông dân] button
**And** clicking [Thêm hộ nông dân] opens a modal form with fields: họ tên, số điện thoại; submitting calls `POST /api/farm/households`
**And** clicking a Household row shows an edit form pre-populated with current data; submitting calls `PUT /api/farm/households/[id]`
**And** clicking [Xóa] on a Household that has parcels shows an error: "Không thể xóa hộ nông dân đang có thửa đất."
**And** clicking [Xóa] on a Household with no parcels shows a confirmation modal; confirming calls `DELETE /api/farm/households/[id]`
**And** the route handler follows hexagonal pattern: Zod validate → `HouseholdUseCase` → `PrismaFarmRepository`

---

### Story 3.2: Parcel Drawing & Map Setup (Officer)

As a Technical Officer,
I want to draw parcel polygons on the farm map and assign them to households and crop types,
So that every piece of HTX land is digitally represented with accurate boundaries and area.

**Acceptance Criteria:**

**Given** the Officer is on the Farm Zone map page
**When** they click [Vẽ thửa mới]
**Then** the Leaflet.draw polygon tool activates; the cursor changes to crosshair; pressing ESC cancels the draw
**And** after completing the polygon, a `ParcelDrawer` side panel opens with fields: select Household (from list), crop type (dropdown), estimated yield per area (kg/ha)
**And** Turf.js auto-calculates area from the polygon coordinates and displays it in hectares (read-only)
**And** submitting calls `POST /api/farm/parcels` which creates the Parcel record and auto-generates a unique parcel code
**And** the new parcel polygon appears on the map in Sowing status color (green, 40% opacity)
**And** the HTX Profile `total_area` field is automatically updated to the sum of all parcel areas via a background recalculation
**And** address search via Nominatim (proxied through `/api/geocode`) is available to pan the map; no manual coordinate entry

**Given** the Officer clicks an existing parcel polygon
**When** the ParcelDrawer opens
**Then** it shows parcel detail: code, household, crop type, area, current status badge, estimated yield
**And** [Chỉnh sửa] allows editing household, crop type, and estimated yield (not the polygon shape post-creation)
**And** [Xóa] shows confirmation modal; confirming calls `DELETE /api/farm/parcels/[id]` (only allowed if no JournalEntries exist)

---

### Story 3.3: Journal Entry — Officer Self-Record

As a Technical Officer,
I want to create farming journal entries for any HTX parcel,
So that all cultivation activities are recorded in the system and my own entries are auto-approved.

**Acceptance Criteria:**

**Given** the Officer navigates to `/officer/journal` and clicks [Tạo nhật ký]
**When** the `JournalEntryForm` renders
**Then** the form contains fields matching the minimum ruleset: date (datetime picker), parcel (dropdown — all HTX parcels), activity type (dropdown: Sowing/Fertilizing/Spraying/Irrigation/Harvest/Other), activity detail (textarea), performed-by (text input)
**And** selecting "Phun thuốc" (Spraying) or "Bón phân" (Fertilizing) as activity type causes product-name, dosage, and (for Spraying) withdrawal-period fields to animate in over 150ms
**And** when the date field loses focus, a `GET /api/weather?date=&lat=&lng=` call is made using the selected parcel's coordinates; the weather fields (temperature, precipitation, humidity, condition) auto-fill from the response
**And** Officer-submitted entries are auto-approved (status = APPROVED, approved_by = Officer's user ID)
**And** submitting calls `POST /api/journal` → Zod validate → `CreateEntryUseCase` → `PrismaJournalRepository`
**And** after submission, the parcel status is auto-derived: if this is the first "Sowing" entry → Sowing; if "Spraying/Fertilizing/Irrigation" → Tending

---

### Story 3.4: Parcel Status Auto-Derivation from Journal

As a Technical Officer,
I want the parcel status on the farm zone map to update automatically based on journal activity,
So that I never have to manually toggle status — the system always reflects the actual cultivation phase.

**Acceptance Criteria:**

**Given** journal entries exist for a parcel
**When** any journal entry is created or approved for that parcel
**Then** a background process (triggered by the UseCase) recalculates parcel status using the rules:
- Has "Sowing" entry, no care entries → `SOWING` (Green)
- Has any Fertilizing / Irrigation / Spraying entry after Sowing → `TENDING` (Yellow/Amber)
- Officer clicked [Phê duyệt thu hoạch] → `HARVEST_APPROVED` (Orange)
- Has "Harvest" entry OR lot created from this parcel → `HARVESTED` (Blue)
**And** the recalculated status is persisted to `parcels.status` via `UpdateParcelStatusUseCase`
**And** the farm zone map (Manager read-only + Officer full view) reflects the new status without page refresh when the Officer reloads

**Given** a new "Sowing" entry is created for a parcel that was previously "Harvested"
**When** the status is recalculated
**Then** the parcel status resets to "SOWING" — beginning a new crop cycle (new `ParcelCropCycle` record created)

---

### Story 3.5: Weather Auto-Attach to Journal Entries

As a Technical Officer,
I want weather data to be automatically attached to each journal entry based on the entry date and parcel location,
So that QR traceability records include environmental conditions without any manual data entry.

**Acceptance Criteria:**

**Given** the Officer is filling the JournalEntryForm and changes the date field
**When** the date field loses focus (blur event)
**Then** the form makes a `GET /api/weather?date=YYYY-MM-DD&parcelId=[id]` call
**And** the API route looks up `weather_cache` for the nearest hourly record to that date for that parcel's centroid coordinates
**And** weather fields in the form auto-fill: condition (e.g., "Nắng"), temperature_c, precipitation_mm, humidity_pct
**And** a loading skeleton is shown in the weather section while the fetch is in progress
**And** if no weather data is found in cache (e.g., for a future date), the fields remain editable and empty

**Given** the Officer backdates a journal entry to a date not in cache
**When** the weather fetch is called
**Then** the API falls back to calling Open-Meteo Historical API for that date/coordinates, stores the result in `weather_cache`, and returns it
**And** the total time from blur to auto-fill is < 2 seconds

---

### Story 3.6: Batch Journal Approval (Officer)

As a Technical Officer,
I want to review and batch-approve pending farmer journal entries in one weekly session,
So that cultivation records are verified efficiently without reviewing each entry individually.

**Acceptance Criteria:**

**Given** the Officer navigates to `/officer/journal/pending`
**When** pending entries exist (submitted by farmers)
**Then** a table shows all PENDING entries with columns: date, parcel, household, activity type, activity detail, submitted-by, with row checkboxes
**And** entries can be filtered by Household via a dropdown filter at the top
**And** Shift+clicking a row checkbox selects a range of rows
**And** a sticky bottom bar shows "Phê duyệt ([N] mục đã chọn)" when any rows are selected

**Given** the Officer selects entries and clicks the sticky "Phê duyệt" button
**When** a confirmation sheet appears ("Phê duyệt [N] nhật ký?")
**Then** confirming calls `POST /api/journal/batch-approve` with the array of entry IDs
**And** each approved entry shows a green checkmark progress indicator in its row while processing
**And** entries that fail validation show an inline error in their row (not a full-page error)
**And** approved entries disappear from the pending list after success
**And** the UseCase triggers parcel status recalculation for each affected parcel (Story 3.4)

**Given** an Officer wants to edit an entry before approving
**When** they click the entry row (not the checkbox)
**Then** the entry opens in an edit drawer; Officer can modify any field; saving auto-approves it

---

### Story 3.7: Technical Announcement to Farmers

As a Technical Officer,
I want to send technical announcements to specific farmer households or all farmers,
So that I can coordinate field activities (e.g., "Collective spraying on 25/07 — ST25 East Zone") without relying on group chat.

**Acceptance Criteria:**

**Given** the Officer navigates to `/officer/announcements/new`
**When** the announcement form loads
**Then** fields are: title (text input), body (textarea), recipient selector (radio: "Tất cả nông dân" / "Hộ cụ thể"), and a [Cũng thông báo Trưởng HTX] checkbox
**And** selecting "Hộ cụ thể" reveals a multi-select household list

**Given** the Officer fills the form and clicks [Gửi]
**When** `POST /api/announcements` is called
**Then** `Notification` records are created for each selected recipient with type='announcement', title, body, sender_id
**And** if "Cũng thông báo Trưởng HTX" is checked, a Notification is also created for the Manager
**And** each recipient's Web Bell badge count increments in real time via SSE
**And** the Officer sees a success toast: "Đã gửi thông báo đến [N] người."

---

## Epic 4: QR Traceability & Disease Detection Backend

Technical Officer can generate product-origin QR codes from harvest-approved parcels with ≥95% auto-fill. Buyers can scan the public QR page to see full cultivation history. The FastAPI disease detection service is deployed and ready.

### Story 4.1: Pre-Harvest Withdrawal Inspection

As a Technical Officer,
I want to see an automatic withdrawal status check for each parcel before approving harvest,
So that I can confidently confirm pesticide safety without manually calculating elapsed days.

**Acceptance Criteria:**

**Given** the Officer opens the `ParcelDrawer` for a parcel in TENDING status
**When** the parcel has at least one "Spraying" journal entry
**Then** a `WithdrawalStatusBlock` renders with: last spray date, chemical name, required withdrawal days (from journal entry), today's date, days elapsed, and status (PASSED / NOT YET)
**And** PASSED block: green left border, green text "An toàn thu hoạch (15 ≥ 14 ngày)", [Phê duyệt thu hoạch] button visible
**And** NOT YET block: amber left border, amber text "Chưa đủ thời gian cách ly ([N] ngày còn lại)", [Phê duyệt thu hoạch] button hidden
**And** if no Spraying entry exists for the parcel: block shows "Không sử dụng thuốc — Tự động PASSED" with green border and [Phê duyệt thu hoạch] visible

**Given** the Officer clicks [Phê duyệt thu hoạch]
**When** the action is confirmed
**Then** `POST /api/farm/parcels/[id]/approve-harvest` is called; parcel status → HARVEST_APPROVED
**And** approver user ID and approval timestamp are recorded in `parcels` table
**And** a Notification is created for the Manager: "Cán bộ [name] phê duyệt thu hoạch thửa [code] lúc [time]."
**And** the parcel polygon on the map changes color to orange immediately on reload

---

### Story 4.2: Lot Creation (Steps 1–4 of QR Workflow)

As a Technical Officer,
I want to create a new harvest lot by selecting harvest-approved parcels,
So that I can group the harvested produce into a tracked lot with an auto-generated lot code.

**Acceptance Criteria:**

**Given** the Officer navigates to `/officer/lots` and clicks [Tạo lô hàng mới]
**When** the `LotWorkflowStepper` renders
**Then** 6 non-clickable step indicators are shown at the top: Farm Zone Setup / Daily Journal / Pre-Harvest Inspection / Lot Consolidation / Review & Finalize / QR Generation
**And** Step 1 (Farm Zone Setup): shows a green checkmark if parcels exist, otherwise a warning with link to Farm Zone page
**And** Step 2 (Daily Journal): shows count of approved journal entries for the selected parcels
**And** Step 3 (Pre-Harvest Inspection): shows withdrawal status summary per parcel
**And** Step 4 (Lot Consolidation): Officer selects from parcels with HARVEST_APPROVED status only (others disabled/grayed)
**And** selecting parcels causes the lot code to auto-generate: format `[HTX_CODE]-[CROP]-[YYYYMMDD]-[NNN]` (e.g., `MD2-ST25-20260720-001`)
**And** quality grade field: dropdown (Grade 1 / Grade 2 / ungraded)
**And** clicking [Tạo lô nháp] calls `POST /api/lots` → creates Lot in DRAFT status; navigates to Step 5

---

### Story 4.3: Lot Review & QR Export (Steps 5–6 of QR Workflow)

As a Technical Officer,
I want to review the auto-filled lot data, enter weight and packaging spec, and export the QR code,
So that a buyer can scan the QR and see the complete, verified cultivation history.

**Acceptance Criteria:**

**Given** the Officer is on Step 5 (Review & Finalize) of the lot workflow
**When** the step renders
**Then** a full preview of the QR content displays — 4 blocks matching the public scan page layout:
- Block 1 (Product & Lot): lot code (mono font), commodity, packaging date (auto = today), total weight (empty — required input), packaging specification (empty — required input)
- Block 2 (Origin): HTX name + contact (auto from HtxProfile), farming household + parcel location (auto from parcel), approving officer (auto from login session)
- Block 3 (Journal & Safety): safety status "PASSED" (auto-calculated), cultivation timeline from Sowing to Harvest-Approved (auto from journal entries)
- Block 4 (Certifications): dropdown to attach uploaded certificates (to be implemented in Epic 6; placeholder "Chưa có chứng nhận" for MVP)
**And** [Xuất QR] button is disabled (grayed) until Weight and Packaging Spec are both filled
**And** Officer can edit any field if needed; [Lưu nháp] saves current state and allows returning later

**Given** Weight and Packaging Spec are filled and Officer clicks [Xuất QR]
**When** `POST /api/lots/[id]/export-qr` is called
**Then** `node-qrcode` generates a QR code containing the URL `/lot/[lotCode]`
**And** the QR image is displayed in the page with a [Tải QR về] download button
**And** lot status transitions: DRAFT → QR_EXPORTED (locked — all fields become read-only)
**And** a Notification is sent to the Manager: "Lô [lotCode] đã xuất QR — [commodity], [weight]kg."

---

### Story 4.4: Public QR Scan Page

As a buyer or any person with the QR code,
I want to scan the QR and see the complete product traceability information,
So that I can verify the origin, cultivation history, and safety status of the produce I'm buying.

**Acceptance Criteria:**

**Given** a buyer scans the QR code and their browser navigates to `/lot/[lotCode]`
**When** the page renders (no authentication required)
**Then** the page renders as a Server Component with no navigation chrome (no sidebar, no TopBar, no login prompt)
**And** the page shows 4 collapsible content blocks (all expanded by default on desktop; collapsed on mobile with tap-to-expand):
- Block 1 (Sản phẩm & Lô hàng): lot code in mono font, commodity, packaging date, total weight, packaging specification
- Block 2 (Nguồn gốc): HTX name + contact, farming household + parcel code + province/district, approving officer name
- Block 3 (Nhật ký & An toàn): safety status "An toàn thu hoạch" or "Không sử dụng thuốc", cultivation timeline table (date, activity, performed-by)
- Block 4 (Chứng nhận): list of attached certificates (placeholder "Chưa có chứng nhận" for MVP)
**And** the page max-width is 640px, horizontally centered
**And** the page has a `print-qr` CSS class enabling clean print layout (no chrome, full content)
**And** page load is < 2 seconds (NFR-4: static render from pre-generated lot data)
**And** `robots.txt` disallows `/lot/` from search engine indexing

**Given** an invalid or non-existent lot code is in the URL
**When** the page renders
**Then** a "Không tìm thấy lô hàng" message is displayed with the lot code shown

---

### Story 4.5: Lot List — Read-Only View for Manager

As an HTX Manager,
I want to see all lots created by the Technical Officer with their status,
So that I can track the cooperative's harvest pipeline and respond quickly to QR export notifications.

**Acceptance Criteria:**

**Given** the Manager navigates to `/manager/lots`
**When** the page loads
**Then** a table shows all Lots with columns: lot code (mono font), commodity, packaging date, total weight, status badge (DRAFT/READY/QR_EXPORTED)
**And** a status filter dropdown (DRAFT / READY / QR_EXPORTED / All) is available at the top
**And** clicking any row navigates to `/manager/lots/[id]` — a read-only detail page showing the same 4-block layout as the public QR scan page

**Given** a Manager receives a notification "Lô [lotCode] đã xuất QR"
**When** they click the notification
**Then** a deep-link navigates them directly to `/manager/lots/[id]` for that specific lot

---

### Story 4.6: Disease Detection FastAPI Service

As a Technical Officer (and enabling the Farmer UI in Epic 5),
I want the AI disease detection FastAPI service deployed in Docker with a working `/predict` endpoint,
So that farmers can submit plant photos for disease diagnosis in Epic 5.

**Acceptance Criteria:**

**Given** the `disease-api` Docker service is running (from Story 1.1)
**When** a `POST /predict` request is made to `http://disease-api:8000/predict` with a multipart image file
**Then** the FastAPI endpoint validates the image using `python-multipart` and `Pillow`
**And** the image is preprocessed (resize, normalize) and passed to the TensorFlow/Keras model
**And** the response is `{ "disease_name": string, "confidence_score": float }` — no treatment or recommendation fields
**And** the response is returned in < 5 seconds for a standard 2MB JPEG image
**And** if confidence_score < 0.6, the `disease_name` is still returned — no suppression
**And** invalid image formats (non-JPEG/PNG) return `{ "error": "Unsupported image format" }` with HTTP 400
**And** a `GET /health` endpoint returns `{ "status": "ok", "model_loaded": true }`
**And** the Next.js API route `POST /api/diagnosis` proxies the request to `http://disease-api:8000/predict` (farmers never call disease-api directly — AD-8 applies)

---

## Epic 5: Farmer Experience & Full Notification System

Farmers have their own role-specific tools: Today dashboard, disease photo diagnosis with PWA offline, self-service journal submission. The full notification pipeline (Mattermost, n8n weekly reminders) goes live.

### Story 5.1: Today Dashboard — All Three Roles

As any authenticated user (Manager / Officer / Farmer),
I want a role-scoped "Today" dashboard as my landing page after login,
So that I immediately see the most important information and actions relevant to my role.

**Acceptance Criteria:**

**Given** the Manager is authenticated and navigates to `/manager/dashboard`
**When** the page loads
**Then** it shows: latest bulletin summary (first 2 sentences, "Xem đầy đủ →" link), lot status counts (DRAFT / QR_EXPORTED), Partner Map quick-access button, and recent notifications count

**Given** the Officer is authenticated and navigates to `/officer/dashboard`
**When** the page loads
**Then** it shows: count of pending journal entries (link to /officer/journal/pending), list of parcels with no journal update in > 14 days (with progress bar indicators), and list of pending disease reports to review

**Given** the Farmer is authenticated and navigates to `/farmer/dashboard`
**When** the page loads
**Then** it shows (in single-column layout with body-large 17px text):
- Plot-level weather for the Farmer's parcels (from weather_cache, by parcel coordinates)
- Commodity price for the Farmer's crop type (deterministically mocked domestic price + trend arrow)
- My Parcels: status of each of the Farmer's own parcels + current crop cycle phase
- Recent Notifications: personal inbox (most recent 5 items with TTS button)
- [Chẩn đoán bệnh] quick-access button (links to /farmer/diagnosis)
- [Nhật ký canh tác] link

**Given** Piper TTS is available and the Farmer clicks the [Nghe] button on the dashboard
**When** the audio request is made
**Then** Piper TTS reads the full dashboard content aloud (weather summary + price + parcel status)

---

### Story 5.2: Farmer Journal Self-Submission

As a young Farmer (Persona B),
I want to record my own farming activities and submit them for officer approval,
So that my cultivation records are in the system and I can withdraw/revise before the officer reviews them.

**Acceptance Criteria:**

**Given** the Farmer navigates to `/farmer/journal` and clicks [Tạo nhật ký]
**When** the `JournalEntryForm` renders for the Farmer
**Then** the parcel dropdown shows ONLY parcels assigned to this Farmer's household (not all HTX parcels)
**And** the form has the same minimum ruleset fields as the Officer form (Story 3.3) except "Performed by" is auto-filled with the Farmer's name (read-only)
**And** conditional Spraying fields animate in the same way as the Officer form
**And** weather auto-fetch works the same way

**Given** the Farmer submits the form
**When** `POST /api/journal` is called with `submitted_by = farmer`
**Then** the entry is created with status = PENDING_APPROVAL
**And** a Notification is sent to the Officer: "Nông dân [name] đã gửi nhật ký cho thửa [code]."
**And** the Farmer's journal list shows the new entry with an amber "Chờ duyệt" badge and a [Rút lại] button

**Given** the Farmer clicks [Rút lại] on a PENDING entry
**When** the withdrawal is confirmed
**Then** `PUT /api/journal/[id]/withdraw` is called; entry status → DRAFT; [Rút lại] is replaced by [Chỉnh sửa]

**Given** the Officer approves the entry (Story 3.6)
**When** the Farmer views their journal list
**Then** the entry shows a green "Đã duyệt" badge; the entry is read-only; the [Rút lại] button is gone
**And** a Notification is sent to the Farmer: "Nhật ký ngày [date] đã được duyệt bởi Cán bộ [name]."

---

### Story 5.3: Farmer Disease Diagnosis UI

As a Farmer,
I want to photograph a diseased plant and receive an AI disease name with confidence percentage,
So that I can quickly report the issue to my Technical Officer without waiting 2-3 days for a field visit.

**Acceptance Criteria:**

**Given** the Farmer navigates to `/farmer/diagnosis` and taps [Chụp ảnh]
**When** the camera or gallery opens and they capture/select a photo
**Then** the image is previewed in the uploader component
**And** a parcel dropdown (own parcels only) must be selected before submission
**And** tapping [Gửi để chẩn đoán] calls `POST /api/diagnosis` with the image + parcel ID

**Given** the diagnosis request is processed
**When** the FastAPI response returns
**Then** the result displays: "AI nhận diện: [disease_name] — Độ tin cậy [N]%"
**And** a mandatory banner below the result: "Đây là dự đoán của AI. Cần xác nhận từ Cán bộ KT trước khi có hành động."
**And** if confidence < 60%, an additional warning: "Ảnh có thể chưa đủ rõ. Cân nhắc chụp lại." — but this does NOT block the [Gửi Cán bộ KT] button

**Given** the Farmer taps [Gửi Cán bộ KT]
**When** the report is submitted
**Then** a `DiseaseReport` record is created with: detection_date, parcel_id, photo_url (MinIO pre-signed), ai_result, confidence_score, detected_by (farmer)
**And** a Notification is sent to the Officer: "Nông dân [name] nghi ngờ [disease_name] tại thửa [code] [Xem ảnh]"
**And** a Web Bell notification is also sent to the Manager (cross-actor visibility)

---

### Story 5.4: PWA Offline — Disease Diagnosis Offline Mode

As a Farmer working in an area with poor connectivity,
I want to photograph and report a diseased plant offline,
So that the report is submitted as soon as I regain connectivity without losing the GPS and time context.

**Acceptance Criteria:**

**Given** the Farmer has no internet connection and opens `/farmer/diagnosis`
**When** they tap [Chụp ảnh]
**Then** the camera still opens and captures the photo normally
**And** GPS coordinates are captured at the moment of photo capture (not at upload time)

**Given** the Farmer selects the parcel and taps [Gửi Cán bộ KT] while offline
**When** the submission is attempted
**Then** the photo + parcel ID + GPS snapshot + timestamp are cached locally (IndexedDB or Cache API)
**And** a banner displays: "Đang chờ kết nối để tải lên. Ảnh đã được lưu lại."
**And** a service worker monitors network connectivity

**Given** the Farmer regains connectivity
**When** the service worker detects the connection is restored
**Then** the cached payload auto-submits via `POST /api/diagnosis`
**And** a success banner appears: "Đã tải lên thành công. Cán bộ KT đã được thông báo."
**And** the disease report and notifications are created exactly as in Story 5.3

---

### Story 5.5: Officer Disease Report Review & Disease Journal

As a Technical Officer,
I want to review AI-diagnosed disease reports from farmers, confirm or correct the diagnosis, and record it in the parcel's disease journal,
So that the cooperative has a permanent disease history record for each parcel.

**Acceptance Criteria:**

**Given** a disease report exists (submitted by Farmer in Story 5.3)
**When** the Officer navigates to `/officer/disease` or clicks the notification deep-link
**Then** the Officer sees the report: farmer photo, AI result + confidence, detection date, parcel, farmer name
**And** the Officer can enter a "Xác nhận chẩn đoán" field (text input, pre-populated with AI result) and modify it
**And** the Officer can add "Ghi chú xử lý" (free text — treatment notes for their own record; NOT displayed to farmer as recommendation)
**And** clicking [Xác nhận] calls `PUT /api/disease-reports/[id]/confirm` → updates confirmed_by, confirmed_diagnosis, treatment_notes

**Given** the confirmation is saved
**When** the Farmer views `/farmer/diagnosis/history`
**Then** they see their household's disease records: detection date, parcel, AI result, confirmed diagnosis, confirmed-by officer name
**And** treatment_notes are NOT shown to the farmer (officer-internal only)
**And** a Notification is sent to the Farmer: "Cán bộ [name] đã xác nhận chẩn đoán: [disease_name]."

---

### Story 5.6: Broadcast Announcement (Manager)

As an HTX Manager,
I want to send a broadcast announcement to all Technical Officers and Farmers,
So that important HTX news (e.g., collective meeting, price update, new policy) reaches everyone through the system — not buried in group chats.

**Acceptance Criteria:**

**Given** the Manager navigates to `/manager/announcements/new`
**When** the announcement form loads
**Then** fields are: title (text input, required), body (textarea, required), [Gửi] button

**Given** the Manager fills the form and clicks [Gửi]
**When** `POST /api/announcements` is called
**Then** `Notification` records are created for every Officer and Farmer in the system with type='broadcast', title, body, sender=Manager
**And** each recipient's Web Bell badge count increments in real time via SSE
**And** the Manager sees: "Đã gửi thông báo đến [N] người."

---

### Story 5.7: Mattermost Push Notification (n8n Connector)

As any user with an external Mattermost account,
I want critical system notifications to be pushed to a Mattermost channel in addition to the Web Bell,
So that I receive alerts even when I'm not logged into the web app.

**Acceptance Criteria:**

**Given** Mattermost is set up and the webhook URL is configured in n8n credentials
**When** a high-priority notification is created in the `notifications` table (type IN ['market_alert', 'disease_report', 'harvest_approved'])
**Then** a database trigger or n8n polling workflow (cron: every 1 min) detects the new notification
**And** the `mattermost-push.json` n8n workflow posts the notification title + body + deep-link to the configured Mattermost webhook channel
**And** the Mattermost message format is: `[DX-AgriMarket] [title]\n[body]\nXem chi tiết: [deep_link_url]`
**And** the workflow JSON is committed to `/workflows/mattermost-push.json`

---

### Story 5.8: n8n Weekly Officer Reminder

As a Technical Officer,
I want an automated Friday reminder notification when I have pending journal entries to review,
So that I never miss my weekly batch-approval responsibility.

**Acceptance Criteria:**

**Given** the `officer-reminder.json` n8n workflow is active
**When** it triggers at Friday 16:00 (cron: `0 16 * * 5`)
**Then** it queries the `journal_entries` table for entries with status = PENDING_APPROVAL older than 7 days
**And** for each Officer with pending entries, it creates a `Notification` record: "Bạn có [N] nhật ký chờ duyệt. Vui lòng phê duyệt trước cuối tuần."
**And** the notification appears in the Officer's Web Bell
**And** if no pending entries exist, no notification is created (no false alarms)
**And** the workflow JSON is committed to `/workflows/officer-reminder.json`

---

## Epic 6: Document Store, Technical Chatbot & Public Storefront

Technical Officer can manage cultivation documents in P.A.R.A structure (MinIO) and ask an agronomy chatbot that references those documents. HTX Manager can share a public capability page listing all export-ready lots with a single URL.

### Story 6.1: MinIO P.A.R.A Document Store — Upload & Browse

As a Technical Officer,
I want to upload, view, and download documents organized into P.A.R.A folders (Projects, Areas, Resources, Archives),
So that all cultivation documents (SOPs, VietGAP certificates, lab reports) are accessible from one place in the system.

**Acceptance Criteria:**

**Given** the Officer navigates to `/officer/documents`
**When** the document store page loads
**Then** a folder-view interface shows the 4 P.A.R.A categories: Projects / Areas / Resources / Archives with a subfolder list under each
**And** clicking a folder shows the files inside with: file name, size, upload date, [Xem] [Tải về] buttons
**And** [Xem] calls `GET /api/documents/[key]/url` → returns a MinIO pre-signed URL (valid 15 min) → opens in a new tab
**And** [Tải về] calls the same endpoint with `download=true` parameter → browser downloads the file

**Given** the Officer clicks [Tải tài liệu lên] and selects a file
**When** the file upload form is submitted with: file, P.A.R.A category, subfolder name (optional)
**Then** `POST /api/documents/upload` → `MinioStorageAdapter` creates a pre-signed upload URL → client uploads directly to MinIO
**And** the file path follows: `para/[category]/[subfolder]/[filename]`
**And** the document list refreshes to show the new file
**And** MinIO SDK is never used in client components — only in the API route adapter (AD-12)

---

### Story 6.2: Certificate Selection in QR Lot Workflow

As a Technical Officer,
I want to attach VietGAP, OCOP, or lab test certificates from the document store to a lot when generating its QR code,
So that buyers scanning the QR can access official quality certificates alongside the cultivation history.

**Acceptance Criteria:**

**Given** the Officer is on Step 5 (Review & Finalize) of the Lot Workflow (Story 4.3)
**When** the "Chứng nhận" section renders (previously showing "Chưa có chứng nhận")
**Then** a dropdown now shows documents stored in MinIO under the `para/Projects/` and `para/Areas/` paths with a search/filter input
**And** the Officer can select one or more certificates from the dropdown
**And** selected certificates are stored as a JSON array of MinIO file keys in `lots.certificate_keys`
**And** the public QR scan page (Story 4.4) now renders the selected certificates in Block 4 as downloadable links (pre-signed URLs generated on page render, valid 15 min)

---

### Story 6.3: Technical Expert Chatbot (Officer)

As a Technical Officer,
I want to ask agronomy questions in Vietnamese and receive answers sourced from HTX's own operational documents,
So that I can quickly consult cultivation SOPs, pesticide guidance, or seasonal plans without searching through files manually.

**Acceptance Criteria:**

**Given** documents exist in the MinIO P.A.R.A store (Story 6.1)
**When** the Officer navigates to `/officer/chatbot`
**Then** the same `ChatWidget` component renders (same behavior as Market Chatbot in Story 2.5)
**And** `POST /api/officer-chatbot` is a separate route from `/api/chatbot` — different RAG pipeline

**Given** the Officer asks a technical question
**When** the API route processes the request
**Then** it retrieves relevant documents from MinIO (using document index or full-text search on extracted text)
**And** it constructs a RAG context from the document content with file name + section as citation
**And** it calls Ollama with a different system prompt scoped to: cultivation techniques, HTX operational documents, crop season processes
**And** out-of-scope questions (market prices) respond: "Câu hỏi về giá thị trường thuộc phạm vi của Trưởng HTX. Vui lòng sử dụng chatbot thị trường."
**And** each AI response includes citation footer: "(Nguồn: [Filename], trang [N])"
**And** the chatbot uses the same `OLLAMA_MODEL` env var (no separate model instance — one Ollama server, two different API routes and system prompts)

---

### Story 6.4: HTX Capability Profile Page (Public Storefront)

As an HTX Manager,
I want a public shareable URL that lists all our export-ready lots with crop details and contact information,
So that I can send one link to potential buyers instead of individual QR links for each lot.

**Acceptance Criteria:**

**Given** lots exist with status QR_EXPORTED or READY
**When** a buyer or partner navigates to `/htx/[htxCode]` (no authentication required)
**Then** the page renders as a Server Component showing:
- HTX name, address, contact information (from HtxProfile)
- A table/list of all lots with status READY or QR_EXPORTED: lot code, commodity, packaging date, total weight, grade
- Each lot row links to the public QR scan page `/lot/[lotCode]`
**And** the page has a "Liên hệ mua hàng" section showing HTX contact details
**And** page load is < 2 seconds (pre-rendered from DB)
**And** `robots.txt` allows indexing of `/htx/` pages (unlike `/lot/` which is robots-excluded)

**Given** the Manager wants to share this page
**When** they navigate to their profile section
**Then** a "Link Trang Năng Lực" field displays the full URL `https://[domain]/htx/[htxCode]` with a [Sao chép] button

---

## Story Coverage Summary

| Epic | Stories | FRs Covered | UX-DRs Covered |
|------|---------|------------|----------------|
| Epic 1: Foundation | 7 stories (1.1–1.7) | FR-H1, FR-H2 + all AD infra | UX-DR1–4 |
| Epic 2: Market Intelligence | 8 stories (2.1–2.8) | FR-A1, FR-A3, FR-B1, FR-B2, FR-E1-basic | UX-DR5–8, 13–18 |
| Epic 3: Farm Zone & Journal | 7 stories (3.1–3.7) | FR-C1, FR-C2, FR-C6 | UX-DR5, 9, 11–13, 15–17 |
| Epic 4: QR & Disease Backend | 6 stories (4.1–4.6) | FR-C3, FR-F1-be, FR-B4 | UX-DR9–10, 15, 20 |
| Epic 5: Farmer & Notifications | 8 stories (5.1–5.8) | FR-D1, FR-F1-ui, FR-G1, FR-B3, FR-E1-full, FR-A2 | UX-DR3, 6–7, 15–19 |
| Epic 6: Docs & Storefront | 4 stories (6.1–6.4) | FR-C4, FR-C5, FR-B5 | UX-DR8, 14–15, 17 |
| **Total** | **40 stories** | **20 FRs** | **20 UX-DRs** |
