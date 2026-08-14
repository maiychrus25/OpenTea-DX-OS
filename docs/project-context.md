# Project Context — DX-AgriMarket
# AI Agent Entry Point

> **MANDATORY:** Read this file FIRST before any implementation task.
> Check referenced docs only when you need specific details.

---

## What This System Is

**DX-AgriMarket** — Agricultural Digital Operating System for Vietnamese HTX (farming cooperatives).
MNM (100% open source). OLP competition + internal production use.

**3 Actors:** Manager (Trưởng HTX) · Officer (Cán bộ Kỹ thuật) · Farmer (Nông dân trẻ)

**AI Invariant (NEVER violate):** AI presents cited facts ONLY. NEVER decides. NEVER recommends actions.

---

## Tech Stack (Quick Reference)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14 App Router | Server Components default |
| CSS | Tailwind CSS v4 + CSS Variables | `@import 'tailwindcss'` trong globals.css |
| Font | Be Vietnam Pro (Google Fonts) | Variable: `--font-be-vietnam` |
| Auth | Keycloak 24 + NextAuth.js 5 | OIDC, Passkeys/PIN |
| State | Zustand 4 | Client global state |
| Map | Leaflet.js + React-Leaflet | `'use client'` + `dynamic(ssr:false)` ALWAYS |
| Validation | Zod 3 | At route handler, before UseCase |
| ORM | Prisma 5 | Schema at `apps/web/prisma/schema.prisma` |
| Database | PostgreSQL 16 | Single source of truth |
| Files | MinIO | Pre-signed URLs only, never direct client access |
| LLM | Groq API Free Tier (Llama-3.1-8B) | `OLLAMA_MODEL` env var, `openai` npm client |
| TTS | Piper TTS | On-demand via `/api/tts` |
| Pipeline | n8n | Writes market_data, weather_cache, bulletins |
| Disease AI | FastAPI + TF/Keras | Internal: `http://disease-api:8000` |
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
DISEASE_API_URL=http://disease-api:8000
```

> **Note:** Dự án sử dụng Groq API Free Tier thay vì tự host Ollama.
> Client library `openai` (npm, Apache 2.0) tương thích OpenAI/Groq.
> Có thể switch về Ollama local bằng cách thay `GROQ_API_KEY` → `OLLAMA_BASE_URL`.

Full list: `.env.example`

---

## Domain Glossary (Use These Terms in Code)

| Term | Code Name | Meaning |
|------|-----------|---------|
| HTX | `HtxProfile` | Hợp tác xã (farming cooperative) |
| Nông hộ | `Household` | Member farming household |
| Thửa đất | `Parcel` | Land parcel (has GeoJSON polygon) |
| Vụ mùa | `ParcelCropCycle` | Crop cycle per parcel per season |
| Nhật ký | `JournalEntry` | Daily farming log |
| Lô hàng | `Lot` | Harvest batch (linked to QR) |
| Bản tin | `Bulletin` | AI-synthesized market bulletin |
| Cán bộ KT | `officer` | Technical/Quality officer role |
| Trưởng HTX | `manager` | HTX manager role |
| Mã lô | `lot_code` | Format: `{HTX_CODE}-{CROP}-{YYYYMMDD}-{NNN}` |

---

## MVP Scope (30/08/2026)

**In:** Auth + HTX Profile + n8n pipelines + Bulletin + TTS + Market Chatbot + Partner Map + Farm Zone Map + Journal + QR + Web Bell + Disease FastAPI (backend only)

**Out:** Farmer UI, Mattermost push, P.A.R.A/MinIO docs, Technical Chatbot, nightly TTS cronjob

**Critical path:** Farm Zone Map → Journal → QR (sequential, cannot parallelize)

---

## Reference Docs

| Need | Read |
|------|------|
| Full architecture decisions | `_bmad-output/planning-artifacts/architecture-dx-agrimarket-20260804/ARCHITECTURE-SPINE.md` |
| All DB tables + ERD | `docs/database-schema.md` |
| API endpoints + request/response | `docs/api-contract.md` |
| Product requirements | `_bmad-output/planning-artifacts/prd-dx-agrimarket-20260804/prd.md` |
| Business analysis source | `docs/BA_Document.md` |
| **UI Design System** | **`docs/DESIGN.md`** — color tokens, components, layout patterns |
