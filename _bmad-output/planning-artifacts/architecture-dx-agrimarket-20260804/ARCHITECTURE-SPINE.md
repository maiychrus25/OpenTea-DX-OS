---
title: "ARCHITECTURE-SPINE — DX-AgriMarket"
status: draft
created: 2026-08-04
updated: 2026-08-04
project: OpenTea-DX-OS
scope: Full system — initiative level
altitude: Initiative → Features
---

# ARCHITECTURE SPINE
# DX-AgriMarket — Agricultural Digital Operating System

---

## 1. Tổng Quan Dự Án

**DX-AgriMarket** là một Hệ điều hành Nông nghiệp Số (Agri-OS) mã nguồn mở, tuân thủ 100% chuẩn MNM, xây dựng trên khung HPDI (Human–Process–Data–Intelligence) của VFOSSA DX-OS.

**Mục tiêu cốt lõi:**
- Phá thế bất cân xứng thông tin giữa HTX và thương lái (price intelligence)
- Số hóa quản lý vùng trồng và nhật ký canh tác
- Sinh QR truy xuất nguồn gốc từ data workflow hàng ngày (≥95% auto-fill)
- Chẩn đoán bệnh cây qua ảnh AI (model đã train sẵn)

**Nguyên tắc AI bất biến (invariant):** AI chỉ tổng hợp và trình bày sự thật có trích dẫn nguồn. KHÔNG ra quyết định, KHÔNG khuyến nghị hành động.

**3 Actor:** HTX Manager (Trưởng HTX) · Technical Officer (Cán bộ KT/CL) · Farmer (Nông dân trẻ — primary target)

**Milestone:** 30/08/2026 POF submission · 10/09/2026 final

---

## 2. Tech Stack

### 2.1 Frontend Libraries (H-layer)

| Thư viện | Version | License | Vai trò |
|---------|---------|---------|--------|
| Next.js | 14.x | MIT | Framework chính — App Router, SSR, API Routes |
| React | 18.x | MIT | UI rendering, Server Components |
| NextAuth.js (Auth.js) | 5.x | ISC | Keycloak OIDC adapter, session management |
| Zustand | 4.x | MIT | Client-side global state management |
| Leaflet.js | 1.9.x | BSD-2 | Map rendering (client-only, dynamic import) |
| React-Leaflet | 4.x | MIT | React wrapper cho Leaflet |
| Leaflet.draw | 1.0.x | MIT | Polygon drawing tool cho Farm Zone |
| Turf.js | 7.x | MIT | Polygon area calculation (ha), client-side |
| node-qrcode | 1.5.x | MIT | QR code generation (server-side trong API route) |
| Zod | 3.x | MIT | Request body validation tại API routes |
| SWR | 2.x | MIT | Client-side data fetching / revalidation |

### 2.2 Backend Libraries (BE trong Next.js + FastAPI)

**Next.js Backend (Node.js runtime):**

| Thư viện | Version | License | Vai trò |
|---------|---------|---------|--------|
| Prisma Client | 5.x | Apache 2.0 | ORM, type-safe DB access |
| Prisma CLI | 5.x | Apache 2.0 | Migration, schema introspection |
| @auth/prisma-adapter | 1.x | ISC | NextAuth.js + Prisma session adapter |
| ollama (npm) | 0.5.x | MIT | Ollama HTTP client wrapper |
| @aws-sdk/client-s3 | 3.x | Apache 2.0 | MinIO S3-compatible client (pre-signed URLs) |
| sharp | 0.33.x | Apache 2.0 | Image resize trước khi upload MinIO |
| uuid | 10.x | MIT | UUID generation cho entities |

**FastAPI Backend (Python runtime):**

| Thư viện | Version | License | Vai trò |
|---------|---------|---------|--------|
| FastAPI | 0.111.x | MIT | REST API framework |
| Uvicorn | 0.30.x | BSD-3 | ASGI server |
| TensorFlow | 2.16.x | Apache 2.0 | Disease model inference |
| Keras | 3.x | Apache 2.0 | High-level model API |
| Pillow | 10.x | HPND | Image preprocessing |
| python-multipart | 0.0.9 | Apache 2.0 | File upload parsing |
| pydantic | 2.x | MIT | Request/response validation |

### 2.3 Infrastructure & Services

| Service | Version | License | Vai trò |
|---------|---------|---------|--------|
| Keycloak | 24.x | Apache 2.0 | Auth provider, WebAuthn/Passkeys, RBAC |
| PostgreSQL | 16.x | PostgreSQL | Primary database |
| n8n | 1.x | Faircode | Data pipeline orchestration |
| Ollama | 0.3.x | MIT | Local LLM inference server |
| Piper TTS | 1.x | MIT | Local TTS engine (vi_VN-vais1000-medium) |
| MinIO | RELEASE.2024 | AGPL v3 | Object storage (as-is, no modification) |
| Docker Compose | 2.x | Apache 2.0 | Container orchestration |

### 2.4 External Data APIs (read-only, ingested by n8n)

| API | License | Data |
|-----|---------|------|
| World Bank API | CC BY 4.0 | Commodity prices & supply |
| WTO Tariff API | CC BY 4.0 | Import tariff rates (EVFTA) |
| World Bank WITS | CC BY 4.0 | Trade statistics |
| FAOSTAT API | CC BY 4.0 | Agricultural production stats |
| NASA POWER API | Public Domain | Historical climate data |
| Open-Meteo API | Open-Meteo | Real-time weather (no API key) |
| ExchangeRate-API | Free/Standard | USD/VND exchange rates |
| Nominatim API | ODbL | Geocoding (server-side proxy only) |

### 2.5 Model Switch (Environment)

```
Environment     OLLAMA_MODEL    RAM cần    Dùng khi
─────────────── ─────────────── ────────────────────────────
local           phi3            ~2.5GB     Dev machines (4GB RAM)
staging/prod    mistral         ~4.5GB     Server demo & POF submission
```

Switch bằng env var `OLLAMA_MODEL` — không đổi code.

---

## 3. Kiến Trúc Hệ Thống (AD-1)

**Paradigm: Layered Monolith with Service Isolation**

```
┌─────────────────────────────────────────────────────────────────┐
│  [H] Human Space                                                │
│  Browser → Next.js App Router (Server Components + Client)     │
│  Auth: Keycloak OIDC via NextAuth.js                           │
│  Map: Leaflet.js (client-only, dynamic import)                 │
├────────────────────────────┬────────────────────────────────────┤
│  Next.js API Routes        │  FastAPI (Disease Model)           │
│  /app/api/[domain]/        │  /apps/disease-api                 │
│  → Prisma → PostgreSQL     │  → TF/Keras model → response      │
├────────────────────────────┴────────────────────────────────────┤
│  [P] Process Space                                              │
│  n8n Orchestrator                                               │
│  ├── Data pipelines: World Bank/WTO/NASA/Open-Meteo → PostgreSQL     │
│  ├── Weekly reminder cronjob (post-30/8)                       │
│  └── External push connector: Mattermost (post-30/8)           │
├─────────────────────────────────────────────────────────────────┤
│  [D] Data Space                                                 │
│  PostgreSQL (Single Source of Truth)                            │
│  MinIO (files: photos, documents, QR assets)                    │
├─────────────────────────────────────────────────────────────────┤
│  [I] Intelligence Space                                         │
│  Ollama (LLM: bulletin synthesis + chatbot RAG)                 │
│  Piper TTS (audio generation, local)                            │
│  FastAPI (disease diagnosis inference)                          │
└─────────────────────────────────────────────────────────────────┘
```

**Rule:** Next.js là entry point duy nhất cho browser. Browser không gọi trực tiếp Ollama, MinIO, FastAPI, hay external APIs.

---

## 4. Architecture Decisions (AD)

### AD-1 — System Paradigm
**Binds:** Layered architecture theo HPDI; mỗi layer có interface rõ ràng
**Prevents:** Frontend gọi external API trực tiếp; business logic trong UI component
**Rule:** Cross-layer call phải đi qua Next.js API route (H→D), n8n workflow (P→D), hoặc Ollama/FastAPI endpoint (I)

### AD-2 — Repository Structure (Monorepo)
**Binds:** 1 GitHub repo; cấu trúc thư mục:
```
OpenTea-DX-OS/
├── apps/
│   ├── web/              ← Next.js application
│   └── disease-api/      ← FastAPI + TF/Keras model
├── docker/               ← Docker Compose files
├── workflows/            ← n8n workflow JSON exports
├── database/             ← Prisma schema + migrations
├── docs/                 ← BA, PRD, Architecture
└── ai-models/            ← Model weights (git-ignored, .gitignore)
```
**Prevents:** Version drift; duplicate Docker config; cross-app issue tracking complexity

### AD-3 — Frontend: Next.js App Router
**Binds:** File-based routing dưới `/app`; Server Components là default; `'use client'` chỉ khi cần interactivity (map, form, chatbot); layouts tái sử dụng qua `layout.tsx`
**Prevents:** Mixing Pages Router convention; data fetching trong Client Components khi không cần

**Role-based routing:**
```
/app/
├── (auth)/login/         ← Public
├── (manager)/            ← Role: manager
│   ├── dashboard/
│   ├── bulletin/
│   ├── chatbot/
│   ├── partner-map/
│   └── farm-zone/        ← Read-only view
├── (officer)/            ← Role: officer
│   ├── dashboard/
│   ├── farm-zone/        ← Full CRUD
│   ├── journal/
│   ├── lots/
│   └── chatbot/
├── (farmer)/             ← Role: farmer
│   ├── dashboard/
│   ├── diagnosis/
│   └── journal/
└── lot/[lotCode]/        ← Public QR scan page (no auth)
```

### AD-4 — ORM: Prisma
**Binds:** Schema-first tại `database/schema.prisma`; tất cả DB access qua Prisma Client; migration qua `prisma migrate deploy`
**Prevents:** Raw SQL trong application code (exception: complex aggregate queries dùng `$queryRaw`); multiple DB access patterns trong cùng domain

**Core domains trong schema:**
```prisma
// Các model chính (seed — owned by code)
model HTXProfile { ... }
model Household { ... }
model Parcel { ... }
model JournalEntry { ... }
model Lot { ... }
model Notification { ... }
model DiseaseReport { ... }
model MarketData { ... }   // Written by n8n
model Bulletin { ... }     // Written by n8n + Ollama
```

### AD-5 — State Management: Zustand
**Binds:** Global UI state trong Zustand stores, mỗi domain 1 store; server state (DB data) qua Next.js `fetch` + React cache hoặc SWR
**Prevents:** Prop drilling quá 2 cấp; Redux cho global state; Context cho high-frequency updates

**Stores:**
```
/apps/web/stores/
├── auth.store.ts         ← Session, role, user info
├── htx-profile.store.ts  ← HTX profile data
├── map.store.ts          ← Map viewport, selected parcel
├── notification.store.ts ← Unread count, notification list
└── ui.store.ts           ← Sidebar state, modal state
```

### AD-6 — CSS: CSS Modules
**Binds:** Mỗi component có file `*.module.css` riêng; CSS custom properties (variables) định nghĩa trong `/apps/web/styles/globals.css`
**Prevents:** Inline styles; global class collision; Tailwind CSS
**Rule:**
```css
/* globals.css — Design tokens */
:root {
  --color-primary: hsl(142, 71%, 45%);   /* Agricultural green */
  --color-accent: hsl(38, 92%, 50%);     /* Harvest orange */
  --color-surface: hsl(0, 0%, 98%);
  --color-text: hsl(220, 15%, 20%);
  --radius-md: 8px;
  --shadow-card: 0 2px 8px hsla(0,0%,0%,0.08);
  --font-sans: 'Inter', system-ui, sans-serif;
}
```

### AD-7 — Authentication: Keycloak + NextAuth.js
**Binds:** Keycloak là auth provider duy nhất; NextAuth.js v5 (Auth.js) làm adapter; role đọc từ Keycloak token claim; tất cả `/app/(manager)`, `/app/(officer)`, `/app/(farmer)` được bảo vệ bởi middleware
**Prevents:** Custom JWT; client-side role check only; bất kỳ auth logic nào trong business service

```typescript
// middleware.ts — Route protection rule
export const config = {
  matcher: ['/(manager)/:path*', '/(officer)/:path*', '/(farmer)/:path*'],
}
// Role mismatch → redirect /unauthorized
```

**Passkeys (WebAuthn):** Configured trong Keycloak Admin, không cần code custom.
**Fallback:** Phone + 6-digit PIN — Keycloak built-in.

### AD-8 — AI Service Isolation
**Binds:** Next.js API route là caller duy nhất của Ollama và FastAPI; không có direct browser → AI call; model switch qua `process.env.OLLAMA_MODEL`
**Prevents:** AI latency từ client; hardcoded model name; multiple AI call patterns

```typescript
// /app/api/bulletin/route.ts — Pattern chuẩn
const model = process.env.OLLAMA_MODEL ?? 'phi3'
const response = await ollama.chat({ model, messages: [...] })
```

**Graceful degradation:**
- Ollama unavailable → bulletin hiển thị raw data từ PostgreSQL, không có AI synthesis
- Piper unavailable → nút "Nghe" ẩn, text-only fallback

### AD-9 — Data Pipeline: n8n owns ingestion
**Binds:** n8n là điểm duy nhất gọi external data APIs (World Bank, WTO, NASA, Open-Meteo, ExchangeRate-API); n8n write vào PostgreSQL; Next.js chỉ read
**Prevents:** Rate limit exposure; duplicate ingestion code; Next.js gọi World Bank API trực tiếp

**n8n workflow schedule:**
```
Every 6h:  World Bank → market_data table
Every 1h:  Open-Meteo → weather_cache table
Every 24h: WTO Tariff + FAOSTAT → tariff_data, fao_data tables
Every 24h: ExchangeRate-API → fx_rates table
Every 24h: Ollama bulletin synthesis → bulletins table
Friday PM: Officer batch-approve reminder (post-30/8)
```

### AD-10 — Map: Client-Side Only
**Binds:** Tất cả Leaflet component phải dùng `dynamic import` với `ssr: false`; Turf.js chạy client-side; Nominatim proxy qua `/app/api/geocode/route.ts` (tránh CORS)
**Prevents:** SSR hydration mismatch với Leaflet; browser gọi Nominatim trực tiếp

```typescript
// Pattern bắt buộc cho mọi Map component
const FarmMap = dynamic(() => import('@/components/map/FarmMap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
})
```

### AD-11 — Notifications: Web Bell + SSE
**Binds:** Notifications lưu trong PostgreSQL `notifications` table; Web Bell đọc qua Server-Sent Events (SSE) endpoint hoặc polling từ Next.js API; n8n handles external push (Mattermost — post-30/8)
**Prevents:** WebSocket cho MVP; client polling Mattermost trực tiếp

### AD-12 — File Storage: MinIO via Pre-signed URLs
**Binds:** MinIO là file store duy nhất; Next.js API route tạo pre-signed URL rồi trả về client; client upload/download trực tiếp đến MinIO bằng URL đó
**Prevents:** File lưu trong PostgreSQL; public MinIO bucket; MinIO SDK trong client components

### AD-13 — Git Workflow: GitHub Flow
**Binds:**
- `main` là nhánh duy nhất, luôn deployable
- Mọi thay đổi đi qua branch đặt tên theo pattern: `feat/[issue-number]-[slug]` hoặc `fix/[issue-number]-[slug]`
- Merge vào `main` chỉ qua Pull Request, cần ít nhất 1 approval
- Commit message theo Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`

**Branch example:**
```
feat/42-farm-zone-crud
fix/57-leaflet-ssr-hydration
chore/12-docker-compose-setup
docs/3-architecture-spine
```

**Prevents:** Direct push to main; long-lived `develop` branch; unnamed commits

### AD-14 — Environment Strategy
**Binds:** 3 môi trường với file `.env` riêng; secrets KHÔNG commit vào git; `.env.example` commit làm template

```
.env.local          ← Local dev (git-ignored)
.env.staging        ← Staging server (git-ignored)
.env.production     ← Production server (git-ignored)
.env.example        ← Template, committed to git
```

**Biến môi trường bắt buộc:**
```bash
# AI
OLLAMA_MODEL=phi3           # local: phi3 | server: mistral
OLLAMA_BASE_URL=http://ollama:11434

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/agrimarket

# Auth
NEXTAUTH_SECRET=...
KEYCLOAK_CLIENT_ID=...
KEYCLOAK_CLIENT_SECRET=...
KEYCLOAK_ISSUER=http://keycloak:8080/realms/agrimarket

# Storage
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...

# External (read by n8n, not Next.js)
# WORLD_BANK_API_KEY, WTO_API_KEY — configured in n8n credentials
```

**Prevents:** Hardcoded URLs; credentials in source code; env confusion between machines

### AD-15 — Backend Architecture: Full Hexagonal (Ports & Adapters)
**Binds:** Domain core hoàn toàn độc lập với framework (không import Next.js, Prisma, Ollama). Mọi dependency đi qua Port interface. Adapter implement Port và nằm ở infrastructure layer.
**Prevents:** Domain import Prisma trực tiếp; route handler chứa business logic; service biết về HTTP request/response

**4 tầng bắt buộc:**
```
app/api/[domain]/route.ts     ← Inbound Adapter  (HTTP → UseCase)
application/[domain]/         ← Use Cases        (orchestration)
domain/[domain]/              ← Domain Core      (pure logic + ports)
infrastructure/[domain]/      ← Outbound Adapters (implements ports)
```

**Full folder structure — `/apps/web/src/`:**
```
src/
├── domain/                              ← PURE BUSINESS LOGIC (no framework)
│   ├── bulletin/
│   │   ├── entities/bulletin.entity.ts
│   │   └── ports/
│   │       ├── bulletin-repository.port.ts      (outbound)
│   │       └── ai-synthesizer.port.ts           (outbound)
│   ├── journal/
│   │   ├── entities/journal-entry.entity.ts
│   │   └── ports/journal-repository.port.ts
│   ├── lot/
│   │   ├── entities/lot.entity.ts
│   │   └── ports/
│   │       ├── lot-repository.port.ts
│   │       └── qr-generator.port.ts
│   ├── farm/
│   │   ├── entities/
│   │   │   ├── parcel.entity.ts
│   │   │   └── household.entity.ts
│   │   └── ports/farm-repository.port.ts
│   ├── notification/
│   │   ├── entities/notification.entity.ts
│   │   └── ports/
│   │       ├── notification-repository.port.ts
│   │       └── notification-channel.port.ts     (Strategy — WebBell / Mattermost)
│   ├── disease/
│   │   ├── entities/disease-report.entity.ts
│   │   └── ports/disease-classifier.port.ts
│   └── shared/
│       ├── value-objects/
│       │   ├── lot-code.vo.ts           (Factory: HTX-CROP-YYYYMMDD-NNN)
│       │   └── coordinates.vo.ts
│       └── errors/domain.errors.ts
│
├── application/                         ← USE CASES (orchestrates domain)
│   ├── bulletin/
│   │   ├── generate-bulletin.usecase.ts
│   │   └── get-latest-bulletin.usecase.ts
│   ├── journal/
│   │   ├── create-entry.usecase.ts
│   │   ├── batch-approve.usecase.ts
│   │   └── get-entries-by-parcel.usecase.ts
│   ├── lot/
│   │   ├── create-lot.usecase.ts
│   │   ├── export-qr.usecase.ts
│   │   └── get-lot-traceability.usecase.ts
│   ├── farm/
│   │   ├── create-parcel.usecase.ts
│   │   ├── update-parcel-status.usecase.ts
│   │   └── get-farm-overview.usecase.ts
│   ├── disease/
│   │   └── diagnose-crop.usecase.ts
│   └── notification/
│       ├── send-notification.usecase.ts
│       └── get-notifications.usecase.ts
│
├── infrastructure/                      ← OUTBOUND ADAPTERS (implements ports)
│   ├── db/
│   │   ├── prisma.client.ts             (Singleton)
│   │   ├── bulletin/prisma-bulletin.repository.ts
│   │   ├── journal/prisma-journal.repository.ts
│   │   ├── lot/prisma-lot.repository.ts
│   │   ├── farm/prisma-farm.repository.ts
│   │   ├── notification/prisma-notification.repository.ts
│   │   └── disease/prisma-disease-report.repository.ts
│   ├── ai/ollama-synthesizer.adapter.ts
│   ├── tts/piper-tts.adapter.ts
│   ├── storage/minio-storage.adapter.ts
│   ├── qr/node-qrcode.adapter.ts
│   ├── disease-api/fastapi-disease-classifier.adapter.ts
│   └── notification-channels/
│       ├── web-bell.channel.ts          (MVP)
│       └── mattermost.channel.ts        (post-30/8)
│
└── app/                                 ← INBOUND ADAPTERS (Next.js)
    ├── api/
    │   ├── auth/[...nextauth]/route.ts
    │   ├── bulletin/route.ts            (GET latest, POST generate)
    │   ├── chatbot/route.ts             (POST message)
    │   ├── diagnosis/route.ts           (POST image)
    │   ├── geocode/route.ts             (GET — Nominatim proxy)
    │   ├── journal/
    │   │   ├── route.ts                 (GET list, POST create)
    │   │   ├── [id]/route.ts            (GET, PUT, DELETE)
    │   │   └── batch-approve/route.ts   (POST)
    │   ├── lots/
    │   │   ├── route.ts                 (GET list, POST create)
    │   │   ├── [id]/route.ts            (GET, PUT)
    │   │   └── [id]/export-qr/route.ts  (POST)
    │   ├── farm/
    │   │   ├── households/route.ts
    │   │   ├── parcels/route.ts
    │   │   └── parcels/[id]/route.ts
    │   ├── notifications/
    │   │   ├── route.ts                 (GET list)
    │   │   └── stream/route.ts          (GET SSE)
    │   ├── partners/route.ts
    │   ├── tts/route.ts                 (POST → Piper)
    │   └── market-data/route.ts         (GET — read from PostgreSQL)
    ├── (auth)/login/page.tsx
    ├── (manager)/
    ├── (officer)/
    ├── (farmer)/
    └── lot/[lotCode]/page.tsx           (Public — no auth)
```

**Rule: Dependency flow:** `app/api → application → domain ← infrastructure`
- Domain NEVER imports from application, infrastructure, hoặc app
- Use Case nhận Port interfaces qua constructor (DI)
- Route handler khởi tạo adapters và inject vào Use Case

```typescript
// Pattern chuẩn — route.ts
export async function POST(req: Request) {
  const body = CreateEntrySchema.parse(await req.json())    // Zod validate
  const repo = new PrismaJournalRepository(prisma)           // Adapter
  const useCase = new CreateEntryUseCase(repo)               // Inject
  const result = await useCase.execute(body)                 // Execute
  return NextResponse.json({ data: result }, { status: 201 })
}
```

### AD-16 — SOLID & Design Patterns
**Binds:** Áp dụng 5 nguyên tắc SOLID và các pattern sau tại service layer

**Single Responsibility:** Mỗi service class chịu trách nhiệm cho đúng 1 domain
```typescript
// ĐÚNG
class WithdrawalService { calculateStatus(parcel) { ... } }
class QRService { generateLot(lotId) { ... } }
// SAI: class LotService { calculateWithdrawal() { ... }; generateQR() { ... } }
```

**Open/Closed — Strategy Pattern cho Notification:**
```typescript
interface NotificationChannel {
  send(payload: NotificationPayload): Promise<void>
}
class WebBellChannel implements NotificationChannel { ... }
class MattermostChannel implements NotificationChannel { ... }  // post-30/8

class NotificationService {
  constructor(private channels: NotificationChannel[]) {}
  async broadcast(payload) {
    await Promise.all(this.channels.map(c => c.send(payload)))
  }
}
```

**Dependency Inversion — Constructor Injection:**
```typescript
// Service nhận dependency qua constructor, không tự instantiate
class BulletinService {
  constructor(
    private prisma: PrismaClient,
    private ollama: OllamaClient,
    private notification: NotificationService,
  ) {}
}
```

**Repository Pattern** cho Prisma access:
```typescript
class JournalRepository {
  constructor(private prisma: PrismaClient) {}
  async findPendingByHousehold(householdId: string) { ... }
  async batchApprove(entryIds: string[]) { ... }
}
```

**Factory Pattern** cho Lot code generation:
```typescript
class LotCodeFactory {
  generate(htxCode: string, crop: string, harvestDate: Date, seq: number): string {
    return `${htxCode}-${crop}-${format(harvestDate,'yyyyMMdd')}-${seq.toString().padStart(3,'0')}`
  }
}
```

**Prevents:** Business logic trong route handlers; service biết về HTTP; god classes; new Service() trực tiếp trong caller

---

## 5. Quy Chuẩn Backend

### 5.1 API Response Format (bắt buộc toàn hệ thống)
```typescript
// Success
{ data: T, meta?: { page, total } }

// Error
{ error: { code: string, message: string, details?: unknown } }

// HTTP status codes:
// 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized,
// 403 Forbidden, 404 Not Found, 500 Internal Server Error
```

### 5.2 Error Handling
- Route handler wrap toàn bộ trong try/catch
- Service layer throw typed errors (`class WithdrawalNotPassedError extends Error`)
- Không leak stack trace ra response trong production

### 5.3 Prisma Best Practices
- Không dùng `findUnique` + check null trong loop → dùng `findMany` với `where: { id: { in: ids } }`
- Transaction cho multi-table writes: `prisma.$transaction([...])`
- Không select `*` trong Prisma — luôn explicit `select: {}` cho sensitive tables

### 5.4 Validation
- Request body validation bằng **Zod** (MIT) tại route handler, trước khi gọi service
- Schema Zod định nghĩa tại `lib/validations/[domain].ts`

### 5.5 Naming Convention
```
Files:       kebab-case.ts           (bulletin-service.ts)
Classes:     PascalCase              (BulletinService)
Functions:   camelCase               (generateBulletin)
Constants:   SCREAMING_SNAKE_CASE    (MAX_CHAT_HISTORY_DAYS)
DB tables:   snake_case              (journal_entries)
API routes:  kebab-case              (/api/journal-entries)
Env vars:    SCREAMING_SNAKE_CASE    (OLLAMA_MODEL)
```

---

## 6. Kiến Trúc Frontend (Feature-based)

### 6.1 AD-18 — Feature-based Folder Structure
**Binds:** Mỗi feature có folder riêng dưới `/app/(role)/[feature]/`; component, hook, type của feature đó nằm trong `_components/` và `_hooks/` cùng cấp (underscore = private, không route)
**Prevents:** Component dressing từ feature này qua feature khác trực tiếp; component tỹp chung cho tất cả

**Full FE folder structure — `/apps/web/src/`:**
```
src/
├── app/                                   ← Next.js pages (inbound adapters)
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   └── login/
│   │       ├── page.tsx
│   │       └── _components/LoginForm.tsx
│   ├── (manager)/
│   │   ├── layout.tsx                     (Manager role guard + sidebar)
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── bulletin/
│   │   │   ├── page.tsx                   (Server Component — fetch data)
│   │   │   └── _components/
│   │   │       ├── BulletinCard.tsx
│   │   │       ├── BulletinCard.module.css
│   │   │       ├── AudioPlayer.tsx            ('use client')
│   │   │       └── AudioPlayer.module.css
│   │   ├── chatbot/
│   │   │   ├── page.tsx
│   │   │   └── _components/
│   │   │       ├── ChatWidget.tsx             ('use client')
│   │   │       └── MessageBubble.tsx
│   │   ├── partner-map/
│   │   │   ├── page.tsx
│   │   │   └── _components/
│   │   │       ├── PartnerMap.tsx             ('use client', dynamic import)
│   │   │       ├── PartnerForm.tsx
│   │   │       └── PartnerMarker.tsx
│   │   └── farm-zone/
│   │       ├── page.tsx                       (Read-only view for manager)
│   │       └── _components/FarmZoneReadOnly.tsx
│   ├── (officer)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── farm-zone/
│   │   │   ├── page.tsx
│   │   │   └── _components/
│   │   │       ├── FarmZoneMap.tsx            ('use client', dynamic import Leaflet)
│   │   │       ├── HouseholdList.tsx
│   │   │       ├── ParcelDrawer.tsx           (Leaflet.draw wrapper)
│   │   │       └── ParcelStatusBadge.tsx
│   │   ├── journal/
│   │   │   ├── page.tsx
│   │   │   └── _components/
│   │   │       ├── JournalEntryForm.tsx       ('use client')
│   │   │       ├── JournalEntryList.tsx
│   │   │       └── BatchApproveButton.tsx
│   │   └── lots/
│   │       ├── page.tsx
│   │       └── _components/
│   │           ├── LotWorkflowStepper.tsx     (6-step QR flow)
│   │           ├── QRExportModal.tsx
│   │           └── LotSummaryCard.tsx
│   ├── (farmer)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   └── diagnosis/
│   │       ├── page.tsx
│   │       └── _components/
│   │           ├── ImageUploader.tsx          ('use client')
│   │           └── DiagnosisResult.tsx
│   └── lot/[lotCode]/
│       └── page.tsx                       (Public QR page — Server Component, no auth)
├── components/                            ← SHARED components (cross-feature)
│   ├── ui/
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   └── Button.module.css
│   │   ├── Card/
│   │   ├── Badge/
│   │   ├── Modal/
│   │   ├── Skeleton/
│   │   └── NotificationBell/              (Web Bell icon + counter)
│   └── layout/
│       ├── AppShell.tsx                   (sidebar + header wrapper)
│       ├── Sidebar.tsx
│       ├── TopBar.tsx
│       └── RoleGuard.tsx                  (redirects on role mismatch)
└── stores/                                ← Zustand stores
    ├── auth.store.ts
    ├── map.store.ts
    ├── notification.store.ts
    └── ui.store.ts
```

### 6.2 Component Rules
- **Server Component là default.** Chỉ thêm `'use client'` khi cần: event handlers, hooks, browser APIs, real-time updates
- **Feature components (`_components/`) chỉ dùng trong feature đó.** Nếu cần dùng ở 2+ feature → move vào `/components/ui/` hoặc `/components/layout/`
- **UI components nhận data qua props**, không tự fetch
- **Map components bắt buộc** `dynamic import` với `ssr: false` (AD-10)

### 6.3 CSS Rules
- Mỗi component có file `*.module.css` riêng (co-location)
- Global tokens trong `styles/globals.css`
- Không inline styles; không global class names

### 6.4 Data Fetching Pattern
```typescript
// ✔ Server Component (preferred)
async function BulletinPage() {
  const useCase = new GetLatestBulletinUseCase(new PrismaBulletinRepository(prisma))
  const bulletin = await useCase.execute()
  return <BulletinCard data={bulletin} />
}

// ✔ Client Component (real-time / user interaction)
'use client'
function ChatWidget() {
  const [messages, setMessages] = useState([])
  // SWR or fetch to /api/chatbot
}
```

### 6.5 Accessibility (TTS)
- Nút "Đọc" (Piper TTS) hiện trên: Bulletin, Notification detail, Chẩn đoán result
- TTS call qua `/api/tts` — không gọi Piper trực tiếp từ browser
- Piper unavailable → ẩn nút, không hiện error

### 6.6 Role-based UI Rule
- `RoleGuard` component / middleware redirect nếu role sai
- Component nhận `canEdit: boolean` từ parent Server Component — không tự check role
- `useSession()` chỉ dùng để hiển thị user info, không dùng để authorize


---

## 7. Kiến Trúc Background (n8n Pipelines)

### 7.1 AD-19 — n8n là Owner duy nhất của Data Ingestion
**Binds:** n8n là điểm duy nhất gọi external APIs (World Bank, WTO, NASA POWER, Open-Meteo, ExchangeRate-API, FAO). n8n write vào PostgreSQL. Next.js chỉ read.
**Prevents:** Next.js gọi World Bank/WTO API trực tiếp; duplicate ingestion logic; rate limit exposure

### 7.2 Pipeline Topology

```
[External APIs]
      │
      ▼
[n8n Orchestrator] ──── credentials stored in n8n only
      │
      ├── HTTP Request Node (World Bank)    ─┐
      ├── HTTP Request Node (WTO Tariff)   ├─ Transform → PostgreSQL Write
      ├── HTTP Request Node (NASA POWER)   │
      ├── HTTP Request Node (Open-Meteo)   │
      ├── HTTP Request Node (FAOSTAT)      │
      └── HTTP Request Node (ExchangeRate-API) ─┘
                                            │
                                            ▼
                                     [PostgreSQL]
                                     market_data
                                     weather_cache
                                     fx_rates
                                            │
                                            ▼
                            [n8n Bulletin Synthesis Workflow]
                            Ollama HTTP Node → bulletins table
```

### 7.3 Workflows (commit vào `/workflows/*.json`)

| File | Trigger | Tác vụ | Ghi vào bảng |
|------|---------|---------|---------------|
| `worldbank_sync.json` / `wto_tariffs.json` | Cron: mỗi 6h | World Bank + WTO + FAOSTAT + NASA POWER | `market_data` |
| `weather-sync.json` | Cron: mỗi 1h | Open-Meteo cho tất cả parcels | `weather_cache` |
| `fx-rates-sync.json` | Cron: mỗi 24h | ExchangeRate-API | `fx_rates` |
| `bulletin-synthesis.json` | Cron: mỗi 24h (04:00) | Query PostgreSQL → Ollama HTTP → Save | `bulletins` |
| `officer-reminder.json` | Cron: Friday 16:00 | Notify officers về pending approvals | `notifications` |
| `mattermost-push.json` | Webhook từ PostgreSQL trigger | Push to Mattermost (post-30/8) | — |

### 7.4 Bulletin Synthesis Workflow (chi tiết)

```
Schedule Trigger (04:00 daily)
    │
    ▼
PostgreSQL Node
    SELECT * FROM market_data WHERE commodity = 'rice'
    AND fetched_at > NOW() - INTERVAL '48h'
    │
    ▼
PostgreSQL Node
    SELECT rates->>'VND' FROM fx_rates ORDER BY fetched_at DESC LIMIT 1
    │
    ▼
Code Node (JS)
    Build RAG context string from market_data rows
    Include citations: source, metric, value, unit, period
    │
    ▼
HTTP Request Node → Ollama /api/chat
    model: {{ $env.OLLAMA_MODEL }}
    messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: context }]
    │
    ▼
Code Node (JS)
    Parse Ollama response
    Set is_latest = false on previous bulletin (same commodity)
    │
    ▼
PostgreSQL Node
    INSERT INTO bulletins (commodity, bulletin_vi, sources_json, model_used, is_latest)
    VALUES (...)
```

**Ollama System Prompt Invariant (bất biến):**
```
Bạn là chuyên gia thị trường nông nghiệp Việt Nam.
Nhiệm vụ: Tổng hợp thông tin từ dữ liệu được cung cấp và viết bản tin.
Quy tắc bất biến:
- CHỈ trình bày sự thật có trích dẫn nguồn.
- KHÔNG ra quyết định thay HTX.
- KHÔNG khuynến nghị hành động cụ thể.
- Mọi số liệu phải kèm nguồn: (Nguồn: World Bank, ngày DD/MM).
```

### 7.5 Weather Sync Workflow (chi tiết)

```
Schedule Trigger (every 1h)
    │
    ▼
PostgreSQL Node
    SELECT id, centroid_lat, centroid_lng FROM parcels
    │
    ▼
SplitInBatches Node (batch size: 10)
    │
    ▼
HTTP Request Node → Open-Meteo
    GET https://api.open-meteo.com/v1/forecast
    ?latitude={lat}&longitude={lng}
    &hourly=temperature_2m,precipitation,wind_speed_10m
    &daily=uv_index_max,precipitation_sum
    │
    ▼
PostgreSQL Node (UPSERT)
    INSERT INTO weather_cache (...) VALUES (...)
    ON CONFLICT (parcel_id) DO UPDATE SET ...
```

### 7.6 n8n Configuration Rules

- **Credentials:** Lưu trong n8n Credential Store, không hardcode vào workflow JSON
- **Error handling:** Mỗi workflow có Error Trigger node — log lỗi vào `notifications` table với `type='system'`
- **Idempotency:** Market data INSERT dùng `ON CONFLICT (source, commodity, metric, period) DO UPDATE` — safe to re-run
- **Workflow version control:** Export JSON sau mỗi thay đổi, commit vào `workflows/`
- **Ollama URL:** `http://ollama:11434` (Docker internal network, không expose ra ngoài)

---

## 8. Docker & Deployment

### 8.1 Docker Compose Services
```yaml
services:
  web:           # Next.js (port 3000)
  postgres:      # PostgreSQL 16 (port 5432, internal only)
  keycloak:      # Keycloak 24 (port 8080)
  n8n:           # n8n (port 5678, internal only)
  ollama:        # Ollama (port 11434, internal only)
  piper:         # Piper TTS HTTP server (port 5500, internal only)
  minio:         # MinIO (port 9000 API, 9001 Console)
  disease-api:   # FastAPI (port 8000, internal only)
```

**Rule:** Chỉ `web`, `keycloak`, `minio` (console) expose ra ngoài. Các service khác internal-only.

### 8.2 Startup Order (depends_on)
```
postgres → keycloak → web
postgres → n8n
postgres → disease-api
ollama → web (health check)
piper → web (health check)
minio → web
```

### 8.3 Volume Strategy
```yaml
volumes:
  postgres_data:     # DB persistence
  minio_data:        # File storage persistence
  ollama_models:     # Downloaded model weights
  n8n_data:          # n8n workflow storage
  keycloak_data:     # Keycloak realm config
```

### 8.4 Prisma Migration trong Docker
```dockerfile
# web/Dockerfile — run migrations before start
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

### 8.5 n8n Workflow Version Control
- n8n workflows export dưới dạng JSON, commit vào `/workflows/`
- Import khi setup môi trường mới: n8n CLI hoặc UI import
- Workflow file naming: `[domain]-[action].json` (market-data-ingestion.json)

---

## 8. Git & Development Workflow

### 8.1 Branch Strategy (AD-13 — GitHub Flow)
```
main (always deployable)
  └── feat/[issue-N]-[slug]      # Feature
  └── fix/[issue-N]-[slug]       # Bug fix
  └── chore/[issue-N]-[slug]     # Infra, config, deps
  └── docs/[issue-N]-[slug]      # Documentation
```

**Quy trình làm việc:**
1. Nhận GitHub Issue → tạo branch từ `main`
2. Code + commit thường xuyên (Conventional Commits)
3. Push branch → mở Pull Request → assign 1 reviewer
4. PR được approve → Squash & Merge vào `main`
5. Branch xóa sau merge

### 8.2 Commit Message Convention (Conventional Commits)
```
feat(journal): add batch approve endpoint
fix(map): resolve leaflet SSR hydration mismatch
chore(docker): add piper TTS service to compose
docs(arch): update routing table for officer role
refactor(lot): extract withdrawal calculation to service
test(journal): add unit test for approval flow
```

**Format:** `type(scope): description`
- `feat` — tính năng mới
- `fix` — sửa bug
- `chore` — config, deps, infra
- `docs` — tài liệu
- `refactor` — refactor không thêm feature
- `test` — thêm/sửa test

### 8.3 Pull Request Rules
- Title theo Conventional Commits format
- Description: link GitHub Issue + mô tả ngắn những gì thay đổi
- Tối thiểu 1 reviewer approval
- Không merge khi có conflict chưa resolve
- Squash & Merge (giữ history sạch)

### 8.4 .gitignore Bắt Buộc
```gitignore
# Environment
.env.local
.env.staging
.env.production

# AI Models (download separately)
ai-models/
ollama_models/

# Node
node_modules/
.next/

# Python
__pycache__/
*.pyc
apps/disease-api/.venv/

# Docker volumes (local data)
postgres_data/
minio_data/
```

---

## 9. Tiêu Chuẩn Viết Code (SOLID & Design Patterns)

*(Xem chi tiết tại AD-16 — tóm tắt nhanh để reference)*

| Nguyên tắc | Áp dụng trong dự án |
|-----------|---------------------|
| **S** — Single Responsibility | 1 service class = 1 domain; route handler chỉ xử lý HTTP |
| **O** — Open/Closed | Strategy pattern cho NotificationChannel |
| **L** — Liskov Substitution | NotificationChannel implementations đều interchangeable |
| **I** — Interface Segregation | Không ép service implement method không dùng đến |
| **D** — Dependency Inversion | Constructor injection cho tất cả service dependencies |

| Pattern | Dùng ở đâu |
|---------|-----------|
| Strategy | NotificationChannel (WebBell / Mattermost) |
| Repository | JournalRepository, ParcelRepository wrapping Prisma |
| Factory | LotCodeFactory (mã lô auto-format) |
| Singleton | Prisma Client (`lib/prisma.ts`), OllamaClient |
| Proxy | `/api/geocode` (Nominatim), `/api/tts` (Piper) |

---

## 10. Deferred Decisions

*(Không cần quyết định trước 30/8 — sẽ xem xét khi relevant)*

| # | Quyết định | Revisit khi |
|---|-----------|-------------|
| D-1 | Testing strategy (unit/integration/e2e) | Sau 30/8, khi có bandwidth |
| D-2 | PWA offline manifest + service worker | Sau 10/9 |
| D-3 | Mattermost connector n8n config | Phase 2C (post-30/8) |
| D-4 | Nightly Piper TTS cronjob (bulletin audio pre-gen) | Post-30/8 optimization |
| D-5 | MinIO bucket lifecycle policy | Khi data volume tăng |
| D-6 | CI/CD pipeline (GitHub Actions) | Sau khi team ổn định workflow |
| D-7 | Rate limiting / throttling cho API routes | Khi multi-HTX hoặc public traffic |
| D-8 | Keycloak realm export/import automation | Khi setup staging server |

---

## 11. Open Questions

| ID | Câu hỏi | Ảnh hưởng |
|----|---------|-----------|
| OQ-A | Piper TTS có hỗ trợ HTTP server mode trong Docker image hiện tại không? Hay cần wrap bằng Flask/FastAPI? | AD-8, TTS sidecar design |
| OQ-B | n8n community version có đủ tính năng cần thiết (webhook, schedule, PostgreSQL node) không, hay cần Enterprise? | AD-9, n8n setup |
| OQ-C | Copernicus Sentinel-2 WMS có cần API key không, hay free access? | AD-10, map layer |
