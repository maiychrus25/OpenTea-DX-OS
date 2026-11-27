# Project Context — OpenTea DX-OS
# AI Agent & Developer Entry Point

> **MANDATORY:** Read this file FIRST before any implementation task.
> Check referenced docs in [`docs/README.md`](./README.md) when you need specific details.

---

## What This System Is

**OpenTea DX-OS** — Digital Transformation Operating System (**DX-OS Open-Core**, HPDI 4-space architecture) purpose-built for **Vietnamese Tea Cooperatives (`HTX Chè Việt Nam`)**.
100% open-source core. Deployed as **Multi-Tenant Cloud SaaS (`htx_code`)** for SME cooperatives and **Sovereign Clusters** for Provincial Cooperative Alliances / Lead Enterprises.

- **Current Code Roles (`v1.17.0`):** `manager` (Giám đốc HTX) · `officer` (Cán bộ KT/CL) · `farmer` (Xã viên trồng chè) + service role `agent`.
- **Target Roadmap Roles ([`product-roadmap.md`](./product-roadmap.md)):** Adds `platform_admin` (SaaS / Provincial Admin), `accountant` (Kế toán / Bàn cân), multi-role `htx_memberships` + Role Switcher.
- **AI & Safety Invariant (`Poka-yoke`):** AI presents cited facts and SHA-256 evidence-backed proposals ONLY. Food-safety clearance (`harvest.approve` / PHI intake gate) and financial disbursements/discounts ALWAYS require human sign-off (see [ADR 0005](./adr/0005-multi-tenant-tea-value-chain-dxos.md)).

---

## Tech Stack (Quick Reference)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14 App Router | Server Components default (`apps/web`) |
| CSS | Tailwind CSS v4 + CSS Variables | `@import 'tailwindcss'` in `globals.css`; tokens in `DESIGN.md` |
| Font | Be Vietnam Pro (Google Fonts) | Variable: `--font-be-vietnam` |
| Auth & Gateway | Keycloak 24 + NextAuth.js 5 + Apache APISIX | OIDC JWT with `htx_code`, Zero-Trust Gateway (`9080` public / `9081` internal) |
| State | Zustand 4 | Client global state |
| Map | Leaflet.js (pure) | `'use client'` + `dynamic(ssr:false)` ALWAYS |
| Validation | Zod 3 | At route handler, before UseCase |
| ORM & Read API | Prisma 5 + Hasura GraphQL v2 | `apps/web/prisma/schema.prisma` + read-only RLS by `htx_code` |
| Database | PostgreSQL 16 + PostGIS + pgvector | Schemas: `public`, `audit`, `telemetry`, `platform`, `app_*` |
| Object Storage & AV | SeaweedFS (S3 API) + ClamAV (`dxos-scanner`) | Pre-signed URLs + P.A.R.A structure; automatic quarantine |
| Data Lifecycle & IoT | Mosquitto MQTT + `dxos-dataops` (Parquet/ZSTD + DuckDB) | 30d hot Postgres → cold S3 data lake |
| LLM & Agentic | Ollama (`qwen2.5:0.5b` default) + optional external providers + `dxos-agent` | Cryptographic `evidence`, human-in-the-loop inbox |
| TTS / STT | Piper TTS + `whisper.cpp` (`dxos-stt`) | Local Vietnamese voice synthesis & transcription |
| Pipeline | n8n (with Kestra exit path, ADR 0001) | Background data & notification orchestration |
| Disease AI | FastAPI + TF/Keras (`apps/disease-api`) | Internal: `http://disease-api:8000` |
| Plug-in Tier 3 | FastAPI + Jinja2 (`miniapps/*` + `platform/appkit` + `./dxos`) | Scriptless SSR mini-apps behind APISIX |
| Infra | Docker Compose | All services containerized |

---

## Architecture: Full Hexagonal (BE) + Feature-based (FE)

### BE — 4 Layers (NEVER skip)
```
app/api/route.ts        → Inbound Adapter   (Zod validate → call UseCase)
application/usecase.ts  → Use Case          (orchestrates domain)
domain/                 → Domain Core       (pure logic, NO framework imports)
infrastructure/         → Outbound Adapters (implements domain ports)
```

**Dependency rule:** `app/api → application → domain ← infrastructure`
Domain NEVER imports Next.js, Prisma, or Ollama directly.

### FE — Feature-based
```
app/(role)/[feature]/
├── page.tsx               ← Server Component (data fetch via UseCase)
└── _components/
    ├── FeatureComponent.tsx    ← 'use client' only if needed
    └── FeatureComponent.module.css
```
Shared components → `components/ui/` or `components/layout/`

### Background — n8n Pipelines
n8n is the ONLY writer to: `market_data`, `weather_cache`, `bulletins`, `fx_rates`
Next.js READS these tables; it NEVER writes them.

---

## Key File Locations

| What | Where |
|------|-------|
| Prisma schema | `apps/web/prisma/schema.prisma` |
| Domain entities | `apps/web/src/domain/[feature]/entities/` |
| Domain ports | `apps/web/src/domain/[feature]/ports/` |
| Use cases | `apps/web/src/application/[feature]/` |
| DB adapters | `apps/web/src/infrastructure/db/[feature]/` |
| AI adapters | `apps/web/src/infrastructure/ai/`, `tts/`, `disease-api/` |
| API routes | `apps/web/src/app/api/[feature]/route.ts` |
| FE features | `apps/web/src/app/(role)/[feature]/` |
| Shared UI | `apps/web/src/components/ui/` |
| Zustand stores | `apps/web/src/stores/` |
| FastAPI app | `apps/disease-api/app/main.py` |
| n8n workflows | `workflows/*.json` |
| Docker config | `docker/docker-compose.yml` |
| Env template | `.env.example` |

---

## Critical Rules (Violating = Wrong)

1. **Route handler = HTTP only.** No business logic. Pattern:
   ```typescript
   const body = Schema.parse(await req.json())          // validate
   const repo = new PrismaXxxRepository(prisma)          // adapter
   const useCase = new XxxUseCase(repo)                  // inject
   return NextResponse.json({ data: await useCase.execute(body) })
   ```

2. **Domain never imports framework.** If you write `import { prisma }` inside `domain/`, it's wrong.

3. **Map = client only.** Every Leaflet component:
   ```typescript
   const MapComponent = dynamic(() => import('./MapComponent'), { ssr: false })
   ```

4. **AI = server only.** Ollama + FastAPI called from API routes only. Never from Client Components.

5. **MinIO = pre-signed URLs.** Never expose MinIO endpoint to browser. Generate URLs in API routes.

6. **CSS = Tailwind CSS v4 + CSS Custom Properties.** No inline styles. Design tokens trong `src/styles/globals.css`. Xem chi tiet: `docs/DESIGN.md`

7. **n8n owns data ingestion.** Never add USDA/WTO/Open-Meteo calls in Next.js code.

8. **Auth check = middleware.** Never rely on client-side role check for authorization.

9. **Conventional Commits.** Format: `feat(journal): description` / `fix(map): description`

10. **Branch from main.** Name: `feat/[issue-N]-[slug]` or `fix/[issue-N]-[slug]`

---

## Environment Variables (Key ones)

```bash
OLLAMA_MODEL=llama-3.1-8b-instant  # Groq Free Tier model
GROQ_API_KEY=your_groq_api_key     # https://console.groq.com (Free Tier, no cost)
DATABASE_URL=postgresql://...
AUTH_SECRET=...
KEYCLOAK_ISSUER=http://keycloak:8080/realms/agrimarket
MINIO_ENDPOINT=minio:9000
```

> **Note:** Dự án sử dụng Groq API Free Tier thay vì tự host Ollama.
> Client library `openai` (npm, Apache 2.0) tương thích OpenAI/Groq.
> Không đặt `GROQ_API_KEY` thì chatbot dùng LLM nội bộ qua gateway (`CORE_GATEWAY_URL`).

Full list: `.env.example`

---

## Domain Glossary (Use These Terms in Code & Tea Domain)

| Term (Vietnamese Tea Domain) | Code Name / Target Entity | Meaning |
|---|---|---|
| HTX Chè | `HtxProfile` | Hợp tác xã chè (Multi-tenant boundary via `htx_code`) |
| Nông hộ / Xã viên | `Household` | Member tea-farming household |
| Nương chè / Thửa đất | `Parcel` | Tea land parcel (GeoJSON polygon, tea cultivar, age, expected yield) |
| Lứa hái (7–9 lứa/năm) | `ParcelCropCycle` | Perennial tea plucking flush (`Lứa <n>/<YYYY>`) + pruning cycle |
| Nhật ký canh tác | `JournalEntry` + `JournalActivity` | Pruning, fertilizing, spraying (with `withdrawal_days` / PHI), plucking |
| Lô chè thành phẩm | `Lot` | Dried/processed tea batch linked to QR traceability (`/lot/[lot_code]`) |
| Mã lô | `lot_code` | ASCII format: `{HTX_CODE}-{CROP}-{YYYYMMDD}-{NNN}` (e.g. `TC-CHE-20261128-001`) |
| Bản tin | `Bulletin` | Market & cooperative bulletin |
| Giám đốc HTX / Cán bộ KT / Xã viên | `manager` · `officer` · `farmer` | Core active roles (`platform_admin`, `accountant` in Roadmap GĐ1) |
| Phiếu cân búp / Mẻ sao / Sổ cái | `FreshLeafTicket` · `ProcessingBatch` · `MemberLedger` | Roadmap GĐ1–GĐ2 Core unified value-chain entities (`product-roadmap.md`) |

---

## Current Baseline (`v1.17.0`) & Strategic Roadmap

- **Implemented (`v1.17.0`):** Multi-tenant Tiers 1–3 (`keycloak`, `apisix`, `hasura`, `seaweedfs`, `clamav`, `mosquitto`, `dxos-dataops`, `apps/web`, `miniapps/*`, `dxos-agent`, `dxos-telegram`).
- **Strategic Alignment Target (`2026-11-28`):** Execute the 5-phase PO/BA roadmap in [`docs/product-roadmap.md`](./product-roadmap.md) & [`ADR 0005`](./adr/0005-multi-tenant-tea-value-chain-dxos.md) — purge mock UI, unify the Tea Value Chain (`Lứa hái` FK + PHI weighing gate + `MemberLedger` debt offset + `ProcessingBatch` mass balance), and remove non-tea rice terminology.

---

## Reference Docs

| Need | Read |
|------|------|
| Documentation index & naming standard | [`docs/README.md`](./README.md) |
| Business analysis (HPDI & Tea Cooperative) | [`docs/business-analysis.md`](./business-analysis.md) |
| Strategic product roadmap (5 phases, KPIs) | [`docs/product-roadmap.md`](./product-roadmap.md) |
| Architecture decisions | [`docs/adr/0001`..`0005`](./adr/0005-multi-tenant-tea-value-chain-dxos.md) |
| Rules, invariants & hard limits | [`docs/rules-and-limits.md`](./rules-and-limits.md) |
| Database schemas & divergences | [`docs/database-schema.md`](./database-schema.md) |
| API endpoints & contracts | [`docs/api-contract.md`](./api-contract.md) |
| Mini-app Tier 3 guide | [`docs/miniapps.md`](./miniapps.md) |
| Known deviations register | [`docs/deviation-register.md`](./deviation-register.md) |
| **UI Design System** | [`DESIGN.md`](../DESIGN.md) — color tokens, components, layout patterns |
