# Rules & Limits — DX-AgriMarket

> Tài liệu này định nghĩa tất cả **ràng buộc cứng** của hệ thống.
> Agent và developer PHẢI đọc file này trước khi implement bất kỳ feature nào.
> Mọi vi phạm đều cần justification rõ ràng và approval từ team lead.

---

## 1. Invariants (Không được vi phạm dưới bất kỳ hoàn cảnh nào)

### 1.1 AI Principle Invariant
```
AI CHỈ tổng hợp và trình bày sự thật có trích dẫn nguồn.
AI KHÔNG ra quyết định thay người dùng.
AI KHÔNG khuyến nghị hành động cụ thể.
Mọi số liệu phải kèm citation: (Nguồn: USDA, ngày DD/MM/YYYY).
```

**Enforcement trong code:**
- Ollama system prompt PHẢI chứa đủ 4 quy tắc trên (xem ARCHITECTURE-SPINE §7.4)
- Response từ `/api/chatbot` và `/api/bulletin` PHẢI chứa `sources` array
- FastAPI `/predict` KHÔNG trả về treatment recommendation — chỉ `disease_name` + `confidence`

### 1.2 MNM (Mã Nguồn Mở) Invariant
```
100% thành phần phải có license MNM-compatible.
KHÔNG sử dụng API keys trả phí ở bất kỳ đâu.
KHÔNG bundle binary proprietary vào source code.
KHÔNG hardcode credentials vào bất kỳ file nào được commit.
```

**Verified MNM stack:** Xem PRD §8 License Compliance Matrix

### 1.3 Security Invariant
```
KHÔNG direct browser → Ollama/FastAPI/MinIO calls.
KHÔNG expose PostgreSQL port ra ngoài Docker network.
KHÔNG store sensitive data (passwords, keys) trong code.
KHÔNG trust client-side role claims — luôn verify từ Keycloak token server-side.
```

---

## 2. Giới Hạn Kỹ Thuật (Hard Limits)

### 2.1 File & Upload Limits

| Loại file | Giới hạn | Enforcement |
|-----------|---------|-------------|
| Disease diagnosis image | Max 5MB | `/api/diagnosis` route — reject với 400 nếu vượt |
| P.A.R.A document (PDF) | Max 10MB | MinIO pre-signed URL config |
| Journal entry photo | Max 3MB per photo, max 5 photos | Route validation |
| Lot QR image | Auto-generated, no limit | server-side |
| n8n workflow JSON export | No limit | version control |

### 2.2 API Rate Limits (per client)

| Endpoint | Giới hạn | Ghi chú |
|----------|---------|---------|
| `POST /api/chatbot` | 20 requests/minute | Ollama sequential queue |
| `POST /api/diagnosis` | 10 requests/minute | FastAPI + image processing |
| `POST /api/tts` | 30 requests/minute | Piper TTS |
| `POST /api/journal/batch-approve` | 5 requests/minute | DB transaction heavy |
| `GET /api/notifications/stream` | 1 SSE connection per user | Browser limit |

> **MVP note:** Rate limiting deferred to post-30/8. For demo environment these limits are unenforced but documented for production.

### 2.3 AI Response Limits

| Model | Max context | Max output | Timeout |
|-------|-------------|-----------|---------|
| Phi-3 Mini 3.8B (local dev) | 4096 tokens | 2048 tokens | 30s |
| Mistral 7B Q4_K_M (server) | 8192 tokens | 4096 tokens | 60s |

**Graceful degradation:** Nếu Ollama timeout → trả về raw market data từ PostgreSQL, không có AI synthesis. Frontend hiển thị banner "AI đang xử lý, dữ liệu thô bên dưới."

### 2.4 Map & Geo Limits

| Metric | Limit | Lý do |
|--------|-------|-------|
| Polygon points per parcel | Max 500 points | Leaflet.draw + Turf.js performance |
| Parcels rendered on map simultaneously | Max 500 | Browser memory |
| Nominatim geocoding rate | 1 req/second | ODbL usage policy |
| Min parcel area | 0.01 ha (100 m²) | Domain validation |
| Max parcel area | 50 ha | Single HTX parcel — sanity check |

### 2.5 Database Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| Journal entries per parcel per cycle | 365 (1/day) | Index on `entry_date` |
| Activities per journal entry | Max 10 | UI constraint |
| Lots per HTX | No hard limit | Pagination required for >50 |
| Notifications per user | Retain 90 days | Cleanup job — post-30/8 |
| Weather cache | 1 record per parcel | UPSERT on conflict |
| Bulletins | 7 per commodity (rolling) | n8n: set is_latest=false after 7 days |
| Partners on map | Max 200 | Performance |

### 2.6 Performance Targets

| Metric | Target | Environment |
|--------|--------|-------------|
| Ollama response | < 10s | CPU server (Mistral 7B) |
| Ollama response | < 5s | Local dev (Phi-3 Mini) |
| API route response (non-AI) | < 500ms | All environments |
| QR public page load | < 2s | Server-rendered from snapshot |
| Map initial render | < 3s | Up to 200 parcels |
| Disease diagnosis | < 5s | FastAPI + TF/Keras |
| TTS generation | < 8s | Piper local (bulletin text ~500 chars) |
| n8n pipeline (weather sync) | < 5 min per run | All parcels batch |

---

## 3. Business Rules (Domain Constraints)

### 3.1 Lot Code Format
```
Format:  {HTX_CODE}-{CROP_CODE}-{YYYYMMDD}-{NNN}
Example: HTXA-RICE-20260804-001

Rules:
- HTX_CODE: uppercase, max 6 chars, from htx_profiles.htx_code
- CROP_CODE: uppercase, max 8 chars, alphanumeric only
- YYYYMMDD: harvest date
- NNN: sequential 3-digit, reset daily per HTX per crop
- Total length: max 30 characters
- UNIQUE constraint enforced in DB
```

### 3.2 Pesticide Withdrawal Calculation
```
safe_harvest_date = entry_date + withdrawal_days

Rules:
- withdrawal_days MUST be set if activity_type = 'pesticide'
- safe_harvest_date MUST be calculated server-side (never trust client)
- Lot cannot be exported if ANY parcel has an active withdrawal period:
  safe_harvest_date > harvest_date → BLOCK lot export with error WITHDRAWAL_NOT_PASSED
- Display in UI: "Cách ly: X ngày — An toàn thu hoạch từ: DD/MM/YYYY"
```

### 3.3 Journal Approval Flow
```
States: draft → pending_approval → approved | rejected

Rules:
- Only officer/farmer can CREATE (status = draft)
- Only officer can SUBMIT for approval (draft → pending_approval)
- Only manager can APPROVE or REJECT (pending_approval → approved/rejected)
- APPROVED entry cannot be edited or deleted
- REJECTED entry can be edited and re-submitted
- Batch approve: max 50 entries per request
```

### 3.4 QR Export Rules
```
Rules:
- Lot MUST have at least 1 linked parcel
- Lot MUST have harvest_date set
- All linked parcels MUST have status = 'harvested' or 'growing'
- No active withdrawal period on any linked parcel (see 3.2)
- QR export generates public_page_data snapshot (JSONB) — immutable after export
- Once exported (status = qr_exported), lot data is frozen
- QR public URL: /lot/{lot_code} — no auth required
```

### 3.5 Parcel Status Transitions
```
idle → growing (when crop cycle created)
growing → harvested (when actual_harvest_date set)
harvested → idle (when new cycle starts)
growing → fallow (when crop failed / abandoned)
fallow → idle (manual reset by officer)

Rule: Cannot delete parcel with active crop cycle (growing status)
```

### 3.6 HTX Profile Rules
```
- Only ONE HTX profile per system deployment
- htx_code: uppercase, max 6 chars, alphanumeric, set on init
- htx_code CANNOT be changed after first lot is exported (lot_code dependency)
- total_area_ha: auto-calculated from sum of parcel areas
- member_count: auto-calculated from count of households
```

### 3.7 Weather Auto-attach Rule
```
When journal entry is created:
- System queries weather_cache WHERE parcel_id = entry.parcel_id
- If cache exists and fetched_at > NOW() - 2h: attach to entry
- If cache stale or missing: skip silently (do not block entry creation)
- Officer can manually override temperature_c and rainfall_mm
```

---

## 4. Security Rules

### 4.1 Authentication
```
- All routes under /(manager)/, /(officer)/, /(farmer)/ require valid session
- Session validation: server-side only via NextAuth.js getServerSession()
- Role check: read from Keycloak token claim 'realm_roles'
- Session timeout: 8 hours (Keycloak configured)
- Passkey (WebAuthn) is primary method; PIN fallback allowed
- NO password storage in application — Keycloak owns all credentials
```

### 4.2 Authorization Matrix

| Action | manager | officer | farmer |
|--------|---------|---------|--------|
| View bulletin + chatbot | ✅ | ✅ | ❌ |
| View partner map | ✅ | ✅ | ❌ |
| CRUD partners | ✅ | ❌ | ❌ |
| View farm zone map | ✅ (read) | ✅ (write) | ❌ |
| CRUD households + parcels | ❌ | ✅ | ❌ |
| Create journal entries | ❌ | ✅ | ✅ (own) |
| Approve journal entries | ✅ | ❌ | ❌ |
| Create + export lots | ❌ | ✅ | ❌ |
| View lots | ✅ | ✅ | ❌ |
| Submit disease diagnosis | ❌ | ✅ | ✅ |
| View disease results | ✅ | ✅ | ✅ (own) |
| View notifications | own only | own only | own only |
| View QR public page | ✅ (no auth) | ✅ (no auth) | ✅ (no auth) |

### 4.3 Data Privacy
```
- Farmer personal data (name, phone) visible only to manager and officer
- Disease photos stored in private MinIO bucket — pre-signed URL expires in 1h
- QR public page: contains NO personal data — only crop/lot/process info
- Notification content: recipient sees only their own notifications
- robots.txt: Disallow /lot/ (QR pages not indexed by search engines)
```

### 4.4 MinIO Bucket Policy
```
Bucket: agrimarket-private
  - disease-photos/     → officer, farmer upload; manager + officer read
  - documents/          → officer upload; manager + officer read (P.A.R.A — post-30/8)
  - journal-photos/     → officer upload; manager + officer read

Bucket: agrimarket-public
  - qr-codes/           → read public (QR image file)

Rule: Pre-signed upload URL expires: 15 minutes
Rule: Pre-signed read URL expires: 60 minutes
```

---

## 5. Code Quality Rules

### 5.1 TypeScript Strictness
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true
}
```
**Rule:** `// @ts-ignore` và `any` type đều bị cấm trừ khi có comment giải thích.

### 5.1b CSS Rules
```
- Dùng Tailwind CSS v4 là primary styling method
- Design tokens khai báo trong src/styles/globals.css (CSS Custom Properties)
- Không inline styles (không dùng style={{}})
- CSS Modules (.module.css) được phép cho animation phức tạp hoặc override đặc biệt
- Không hardcode màu sắc — dùng var(--primary), var(--border), v.v.
- Tham khảo docs/DESIGN.md cho component patterns chuẩn
```

### 5.2 Naming Conventions
```
Files:        kebab-case.ts              (bulletin-service.ts)
Interfaces:   IPrefixOrSuffix — KHÔNG  → PascalCase là đủ (BulletinRepository)
Types:        PascalCase                (JournalEntryStatus)
Enums:        PascalCase + UPPER value  (enum LotStatus { DRAFT = 'draft' })
Constants:    SCREAMING_SNAKE_CASE      (MAX_WITHDRAWAL_DAYS)
DB columns:   snake_case                (safe_harvest_date)
API routes:   kebab-case                (/api/journal-entries)
Env vars:     SCREAMING_SNAKE_CASE      (OLLAMA_MODEL)
```

### 5.3 Comment Rules
```
- Không comment những gì code đã nói rõ
- Comment khi: business rule phức tạp, workaround, hoặc non-obvious decision
- Vietnamese OK cho business comments; English cho technical comments
- TODO format: // TODO(issue-N): description
- NEVER leave console.log in committed code
```

### 5.4 Import Order
```typescript
// 1. Node.js built-ins
import { readFile } from 'fs/promises'

// 2. External packages
import { NextResponse } from 'next/server'
import { z } from 'zod'

// 3. Internal — absolute (@/)
import { prisma } from '@/infrastructure/db/prisma.client'

// 4. Internal — relative
import { LotCodeFactory } from './lot-code.vo'
```

### 5.5 Error Handling Pattern
```typescript
// ✅ Correct
export async function POST(req: Request) {
  try {
    const body = CreateLotSchema.parse(await req.json())
    const result = await useCase.execute(body)
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: error.message } },
        { status: 400 }
      )
    }
    if (error instanceof WithdrawalNotPassedError) {
      return NextResponse.json(
        { error: { code: 'DOMAIN_ERROR', message: error.message } },
        { status: 422 }
      )
    }
    console.error('[POST /api/lots]', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
```

---

## 6. n8n Workflow Rules

```
- Mỗi workflow PHẢI có Error Trigger node
- Credentials KHÔNG được hardcode trong workflow JSON
- Workflow JSON PHẢI được export và commit sau mỗi thay đổi
- Market data INSERT PHẢI dùng UPSERT (ON CONFLICT DO UPDATE)
- Ollama URL trong n8n: http://ollama:11434 (không đổi)
- Bulletin synthesis: set is_latest = false trên record cũ TRƯỚC khi INSERT mới
- Mỗi workflow có timeout: 5 phút max
- Không chạy weather sync khi có < 1 parcel trong DB
```

---

## 7. Git Rules

```
- KHÔNG push trực tiếp lên main
- KHÔNG merge PR của chính mình
- KHÔNG commit .env files (chỉ .env.example)
- KHÔNG commit node_modules/, .next/, __pycache__/, ai-models/
- Mỗi commit PHẢI theo Conventional Commits format
- PR title PHẢI theo format: feat(scope): description
- Branch name PHẢI theo format: feat/N-slug hoặc fix/N-slug
- Squash & Merge khi merge vào main
```

---

## 8. Deferred Rules (áp dụng sau 30/8)

| Rule | Khi nào áp dụng |
|------|----------------|
| Rate limiting enforcement (middleware) | Khi deploy staging/production |
| Notification cleanup job (90 days) | Sau 10/9 |
| MinIO bucket lifecycle policy | Khi data > 1GB |
| Keycloak session timeout configuration | Trước final production |
| robots.txt + sitemap.xml | Trước go-live |
| HTTPS / SSL termination | Trước public deployment |
