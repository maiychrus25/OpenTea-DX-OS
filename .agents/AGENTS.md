# AGENTS.md — DX-AgriMarket
# Project-Scoped Rules cho AI Agents

> File này áp dụng cho **tất cả AI agents** làm việc trong project này.
> Scope: Workspace `.agents/AGENTS.md`

---

## 🔴 MANDATORY FIRST STEP — Luôn làm trước tiên

Trước bất kỳ task nào, agent PHẢI đọc theo thứ tự:

```
1. docs/project-context.md          ← Entry point (~200 dòng, đọc toàn bộ)
2. docs/rules-and-limits.md §1      ← Invariants (bắt buộc)
3. Đọc thêm nếu cần:
   - docs/database-schema.md        ← Khi làm task liên quan DB
   - docs/api-contract.md           ← Khi làm task liên quan API/route
   - docs/DESIGN.md                 ← Khi làm task liên quan FE/UI/CSS
   - ARCHITECTURE-SPINE.md §4 AD-N  ← Khi cần chi tiết architecture decision
```

---

## Ngôn ngữ & Giao Tiếp

- **Trả lời bằng tiếng Việt** với developer (Thinh và team)
- Code, comments kỹ thuật, variable names: **English**
- Business comments trong code: **Vietnamese OK**
- Commit messages: **English** (Conventional Commits)
- Tên file, folder: **English kebab-case**

---

## Architecture Rules (Không được vi phạm)

### Hexagonal Architecture — BE
```
PHẢI:
✅ Domain layer: chỉ chứa entities, ports (interfaces), value objects
✅ Use Cases: nhận dependencies qua constructor injection
✅ Route handler: Zod validate → khởi tạo adapters → inject → execute → return HTTP
✅ Infrastructure adapters: implement domain ports

KHÔNG ĐƯỢC:
❌ import { prisma } bên trong domain/ folder
❌ business logic bên trong app/api/route.ts
❌ Domain service biết về NextResponse, Request, Headers
❌ Gọi Ollama/FastAPI trực tiếp từ domain layer
```

### Feature-based Architecture — FE
```
PHẢI:
✅ Feature components đặt trong _components/ cùng cấp với page.tsx
✅ Server Component là default — thêm 'use client' chỉ khi cần
✅ Shared components (dùng ở 2+ feature) → components/ui/ hoặc components/layout/

KHÔNG ĐƯỢC:
❌ Import component từ feature này sang feature khác trực tiếp
❌ Fetch data trong Client Component khi Server Component có thể làm được
❌ Leaflet component render trên server (phải dynamic import ssr:false)
```

### Background (n8n)
```
KHÔNG ĐƯỢC:
❌ Thêm USDA/WTO/Open-Meteo/Frankfurter/NASA call vào Next.js code
❌ Next.js route write vào market_data, weather_cache, bulletins, fx_rates
❌ Hardcode model name — luôn dùng process.env.OLLAMA_MODEL
```

---

## Code Quality Rules

### TypeScript
- `strict: true` — không tắt
- Không dùng `any` trừ khi có comment giải thích rõ lý do
- Không dùng `// @ts-ignore` trừ khi truly unavoidable + comment giải thích
- `noUnusedLocals: true` — xóa import/variable thừa

### Naming (xem chi tiết rules-and-limits.md §5.2)
- Files: `kebab-case.ts`
- Classes/Types: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- DB tables: `snake_case`

### CSS
- Dùng **Tailwind CSS v4** là primary styling method
- Design tokens (CSS Custom Properties) trong `src/styles/globals.css`
- Không inline styles — không dùng `style={{}}`
- CSS Modules (`.module.css`) được phép cho animation phức tạp hoặc override đặc biệt
- Không hardcode màu sắc — dùng `var(--primary)`, `var(--border)`, v.v.
- Tham khảo `docs/DESIGN.md` cho component patterns và design tokens chuẩn

### Không để lại
- `console.log` trong committed code (dùng proper error handling)
- `TODO` không có issue number (format: `// TODO(issue-42): description`)
- Hardcoded strings mà nên là constants/env vars
- Unused imports

---

## Git & PR Rules

```bash
# Branch naming
feat/42-farm-zone-crud
fix/57-leaflet-ssr-hydration
chore/12-docker-compose-setup
docs/3-architecture-spine

# Commit format (Conventional Commits)
feat(journal): add batch approve endpoint
fix(map): resolve leaflet SSR hydration mismatch
chore(docker): add piper TTS service
docs(arch): update routing table
refactor(lot): extract withdrawal calculation to service
```

**PR Rules:**
- Title theo Conventional Commits
- Body: link GitHub Issue + mô tả ngắn những gì thay đổi
- Minimum 1 approval
- Squash & Merge only
- Không merge PR của chính mình

---

## AI Invariant (Không được vi phạm trong bất kỳ code nào)

```
Khi generate Ollama system prompt:
PHẢI bao gồm 4 quy tắc:
1. CHỈ trình bày sự thật có trích dẫn nguồn
2. KHÔNG ra quyết định thay HTX
3. KHÔNG khuyến nghị hành động cụ thể
4. Mọi số liệu phải kèm nguồn

Khi implement FastAPI /predict:
KHÔNG trả về treatment/recommendation — chỉ disease_name + confidence_score

API response từ chatbot/bulletin PHẢI chứa sources array (không được bỏ trống)
```

---

## Security Rules

```
KHÔNG commit bất kỳ thứ gì vào .env files (chỉ .env.example)
KHÔNG expose internal service ports ra ngoài Docker (chỉ web:3000, keycloak:8080, minio:9001)
KHÔNG gọi MinIO SDK từ client component — chỉ pre-signed URLs
Auth check PHẢI server-side (getServerSession) — không tin client role
```

---

## Khi Gặp Ambiguity

**Thứ tự ưu tiên khi có conflict:**

1. **Invariants** (`docs/rules-and-limits.md §1`) — tuyệt đối, không exception
2. **Architecture Decisions** (ARCHITECTURE-SPINE §4 AD-N) — follow AD, không tự ý thay đổi
3. **PRD scope** (prd.md) — không tự ý thêm feature ngoài MVP scope
4. **Story file** (nếu có) — follow story spec
5. **Common sense** — nếu vẫn unclear, hỏi developer

**Khi implement feature mới:**
1. Check story file nếu có
2. Check api-contract.md cho endpoint spec
3. Check database-schema.md cho table structure
4. Follow Hexagonal pattern từ AD-15
5. Tạo file theo feature-based structure từ AD-18

---

## Phạm Vi Được Phép Tự Quyết

Agent có thể tự quyết (không cần hỏi) khi:
- Chọn biến name / helper function name
- Viết comment giải thích code
- Tạo Zod schema shape cho request body (phải match api-contract.md spec)
- Implement error handling pattern (phải follow rules-and-limits.md §5.5)
- Chọn CSS class names trong module.css
- Thêm TypeScript type utilities

Agent PHẢI hỏi developer khi:
- Thêm dependency mới (package.json hoặc requirements.txt)
- Thay đổi database schema (schema.prisma)
- Thay đổi Docker Compose config
- Thêm env variable mới
- Thay đổi API endpoint URL hoặc response shape
- Feature nằm ngoài MVP scope (xem prd.md)
- Architecture Decision không cover trường hợp đang gặp

---

## Domain Glossary (dùng đúng tên trong code)

| Tiếng Việt | Code name | Không dùng |
|-----------|-----------|-----------|
| Hợp tác xã | `HtxProfile` | cooperative, farm |
| Nông hộ | `Household` | farmer, member |
| Thửa đất | `Parcel` | field, land, plot |
| Vụ mùa | `ParcelCropCycle` | season, cycle |
| Nhật ký canh tác | `JournalEntry` | log, diary, record |
| Hoạt động trong nhật ký | `JournalActivity` | task, action |
| Lô hàng | `Lot` | batch, shipment |
| Mã lô | `lot_code` | lot_id, batch_code |
| Bản tin thị trường | `Bulletin` | report, news |
| Thông báo | `Notification` | alert, message |
| Cán bộ kỹ thuật | `officer` (role) | technician, staff |
| Trưởng HTX | `manager` (role) | admin, leader |
| Nông dân | `farmer` (role) | user, member |
| Thời gian cách ly | `withdrawal_days` | quarantine, wait |
| Ngày an toàn thu hoạch | `safe_harvest_date` | harvest_safe_date |

---

## License Comment Header (Bắt Buộc — 100% không được bỏ sót)

> **Rule:** Mọi file mới tạo ra trong project này PHẢI có license header comment ở đầu file.
> **Không có ngoại lệ.** Dev agent bị coi là không hoàn thành task nếu bỏ sót header.

### Format theo loại file

```typescript
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
```
> Áp dụng cho: `.ts` / `.tsx` / `.js` / `.jsx`

```python
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.
```
> Áp dụng cho: `.py`

```css
/* Copyright (c) 2026 OpenTea Developers
   Licensed under the MIT License. See LICENSE file in the project root for full license information. */
```
> Áp dụng cho: `.css` / `.module.css`

```yaml
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.
```
> Áp dụng cho: `.yml` / `.yaml` / `.sh` / `Dockerfile`

### Quy tắc áp dụng

```
PHẢI thêm header khi:
✅ Tạo file mới bất kỳ (NEW file trong task list)
✅ Refactor/rename file (giữ nguyên hoặc thêm mới header)
✅ File được tạo bởi agent (bao gồm cả script, config, migration)

KHÔNG cần thêm header cho:
❌ File có sẵn từ trước (chỉ MODIFY, không phải NEW)
❌ File auto-generated (prisma migrations, .lock files, node_modules)
❌ JSON files (không có comment syntax)
❌ Markdown .md files
❌ .env / .env.example (security — no copyright comment in env files)
❌ Test fixture files (mock data, test assets)
```

### Luồng tích hợp (Agent Workflow)

Mỗi khi agent tạo file mới, PHẢI làm theo thứ tự:
1. Xác định loại file (`.ts`, `.css`, `.py`, v.v.)
2. Thêm license header đúng format **trên cùng dòng đầu tiên**
3. Blank line sau header
4. Bắt đầu nội dung file thực tế

**Ví dụ đúng cho `.tsx`:**
```tsx
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
// ... rest of file
```

**Ví dụ đúng cho `.module.css`:**
```css
/* Copyright (c) 2026 OpenTea Developers
   Licensed under the MIT License. See LICENSE file in the project root for full license information. */

.container {
  /* ... */
}
```

### Verification (CI / Code Review)

Code review agent (bmad-code-review, pr-deep-review) PHẢI kiểm tra:
- Mọi file NEW trong diff có license header không
- Sai format -> finding severity HIGH
- Thiếu hoàn toàn -> finding severity CRITICAL

```bash
# CI check command (thêm vào pipeline):
# Verify all new .ts/.tsx/.css files have license header
git diff --name-only --diff-filter=A HEAD~1 | grep -E '\.(ts|tsx|js|jsx|css|py)$' | while read f; do
  if ! head -1 "$f" | grep -q "Copyright"; then
    echo "MISSING LICENSE HEADER: $f"
    exit 1
  fi
done
```
