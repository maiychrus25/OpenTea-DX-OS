# Hướng dẫn Đóng góp (Contributing Guide)

Chào mừng bạn đến với **DX-AgriMarket**! Chúng tôi rất vui vì bạn quan tâm và muốn đóng góp cho dự án — một hệ điều hành số nông nghiệp phục vụ các Hợp tác xã (HTX) tại Việt Nam.

Để quá trình cộng tác diễn ra trơn tru, vui lòng đọc kỹ các quy tắc dưới đây trước khi gửi Pull Request (PR).

---

## 1. Triết lý Thiết kế

Trước khi code, hãy chắc chắn bạn đã đọc qua các tài liệu cốt lõi của dự án:

| Tài liệu | Đọc để làm gì |
|-----------|---------------|
| **[project-context.md](./docs/project-context.md)** | Nắm rõ tầm nhìn, tech stack, kiến trúc tổng quan (~200 dòng) |
| **[rules-and-limits.md](./docs/rules-and-limits.md)** | Invariants, business rules, coding standards — bắt buộc |
| **[AGENTS.md](./AGENTS.md)** | Rules cho AI agents và developers — architecture, naming, security |
| **[database-schema.md](./docs/database-schema.md)** | Cấu trúc database (khi làm task liên quan DB) |
| **[api-contract.md](./docs/api-contract.md)** | API endpoint specs (khi làm task liên quan API) |
| **[DESIGN.md](./docs/DESIGN.md)** | Design tokens, component patterns (khi làm task FE/UI) |

> **Quy tắc vàng:** DX-AgriMarket tuân thủ 100% mã nguồn mở (MNM). Không sử dụng API keys trả phí, không bundle binary proprietary, không hardcode credentials.

---

## 2. Quy trình Đóng góp

### 2.1 Bắt đầu

1. **Fork repository** về tài khoản cá nhân của bạn.
2. **Clone** repo đã fork về máy:
   ```bash
   git clone https://github.com/<your-username>/OpenTea-DX-OS.git
   cd OpenTea-DX-OS
   ```
3. Cài đặt dependencies:
   ```bash
   cp .env.example .env
   cd apps/web && npm install
   ```
4. Chạy hệ thống (cần Docker):
   ```bash
   cd docker && docker compose up -d
   cd ../apps/web && npm run dev
   ```
   Khi chạy `npm run dev` trên máy (ngoài Docker), đặt `CORE_GATEWAY_URL=http://localhost:9080`, vì `apisix:9081` chỉ truy cập được bên trong mạng Docker.

### 2.2 Tạo Branch

Tạo một **branch mới** từ nhánh `main`. Tên branch phải tuân thủ quy tắc:

| Pattern | Dùng khi |
|---------|---------|
| `feat/<issue-number>-slug` | Thêm tính năng mới |
| `fix/<issue-number>-slug` | Sửa bug |
| `docs/<issue-number>-slug` | Cập nhật tài liệu |
| `refactor/<issue-number>-slug` | Tái cấu trúc code không đổi behavior |
| `chore/<issue-number>-slug` | CI/CD, dependencies, config |

**Ví dụ:**
```bash
git checkout -b feat/42-farm-zone-crud
git checkout -b fix/57-leaflet-ssr-hydration
```

### 2.3 Gửi Pull Request

1. Push branch lên repo đã fork của bạn.
2. Tạo **Pull Request** vào nhánh `main` của repo gốc.
3. PR description **phải** chứa:
   - Link đến GitHub Issue: `Closes #N` hoặc `Fixes #N`
   - Mô tả ngắn gọn những gì thay đổi
4. Chờ review — cần tối thiểu **1 approval** để merge.
5. Merge method: **Squash & Merge** only.

---

## 3. Quy ước Commit (Conventional Commits)

Dự án sử dụng chuẩn [Conventional Commits](https://www.conventionalcommits.org/). Mọi commit phải theo định dạng:

```
<type>(<scope>): <subject>
```

| Type | Dùng khi |
|------|---------|
| `feat` | Thêm tính năng mới |
| `fix` | Sửa bug |
| `docs` | Cập nhật tài liệu |
| `refactor` | Tái cấu trúc code (không đổi behavior) |
| `test` | Thêm/sửa test |
| `chore` | Cấu hình CI/CD, dependencies |
| `style` | Format code, không đổi logic |

**Ví dụ commit hợp lệ:**
```
feat(journal): add batch approve endpoint
fix(map): resolve leaflet SSR hydration mismatch
chore(docker): add piper TTS service
docs(arch): update routing table
refactor(lot): extract withdrawal calculation to service
```

---

## 4. Tiêu chuẩn Mã nguồn (Coding Standards)

### 4.1 TypeScript

- `strict: true` — không tắt.
- Không dùng `any` trừ khi có comment giải thích rõ lý do.
- Không dùng `// @ts-ignore` trừ khi truly unavoidable + comment giải thích.
- `noUnusedLocals: true` — xóa import/variable thừa.

### 4.2 Naming Convention

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| Files | `kebab-case.ts` | `parcel-repository.ts` |
| Classes/Types | `PascalCase` | `ParcelCropCycle` |
| Functions/Variables | `camelCase` | `calculateWithdrawal` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_UPLOAD_SIZE` |
| DB tables | `snake_case` | `disease_reports` |

### 4.3 Domain Glossary (dùng đúng tên)

| Tiếng Việt | Code name | Không dùng |
|-----------|-----------|-----------|
| Hợp tác xã | `HtxProfile` | cooperative, farm |
| Nông hộ | `Household` | farmer, member |
| Thửa đất | `Parcel` | field, land, plot |
| Vụ mùa | `ParcelCropCycle` | season, cycle |
| Nhật ký canh tác | `JournalEntry` | log, diary, record |
| Lô hàng | `Lot` | batch, shipment |
| Bản tin thị trường | `Bulletin` | report, news |

### 4.4 CSS

- Dùng **Tailwind CSS v4** là primary styling method.
- Design tokens (CSS Custom Properties) trong `src/styles/globals.css`.
- Không inline styles — không dùng `style={{}}`.
- CSS Modules (`.module.css`) được phép cho animation phức tạp hoặc override đặc biệt.

### 4.5 Icons

- **Chỉ dùng** `lucide-react` — không dùng emoji hoặc thư viện icon khác.
- Mọi icon phải có `aria-hidden="true"` (trang trí) hoặc `aria-label` (icon-only button).

### 4.6 License Header

Mọi file mới tạo ra (`.ts`, `.tsx`, `.css`, `.py`, `.yml`) **phải** có license header:

```typescript
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
```

---

## 5. Kiến trúc (Architecture Rules)

### 5.1 Backend — Hexagonal Architecture

```
PHẢI:
  - Domain layer: chỉ chứa entities, ports (interfaces), value objects
  - Use Cases: nhận dependencies qua constructor injection
  - Route handler: Zod validate -> khởi tạo adapters -> inject -> execute -> return HTTP
  - Infrastructure adapters: implement domain ports

KHÔNG ĐƯỢC:
  - import { prisma } bên trong domain/ folder
  - Business logic bên trong app/api/route.ts
  - Domain service biết về NextResponse, Request, Headers
```

### 5.2 Frontend — Feature-based Architecture

```
PHẢI:
  - Feature components đặt trong _components/ cùng cấp với page.tsx
  - Server Component là default — thêm 'use client' chỉ khi cần
  - Leaflet component PHẢI dynamic import ssr:false

KHÔNG ĐƯỢC:
  - Import component từ feature này sang feature khác trực tiếp
  - Fetch data trong Client Component khi Server Component có thể làm được
```

---

## 6. AI Invariant (Bắt buộc khi code liên quan AI)

```
1. AI CHỈ trình bày sự thật có trích dẫn nguồn
2. AI KHÔNG ra quyết định thay HTX
3. AI KHÔNG khuyến nghị hành động cụ thể
4. Mọi số liệu phải kèm nguồn citation
```

- FastAPI `/predict`: KHÔNG trả về treatment/recommendation — chỉ `disease_name` + `confidence_score`
- API response từ chatbot/bulletin **PHẢI** chứa `sources` array (không được bỏ trống)
- Ollama model name: luôn dùng `process.env.OLLAMA_MODEL`, KHÔNG hardcode

---

## 7. Security Checklist

Trước khi submit PR, hãy tự kiểm tra:

- [ ] Không commit bất kỳ thứ gì vào `.env` files (chỉ `.env.example`)
- [ ] Không expose internal service ports ra ngoài Docker
- [ ] Không gọi MinIO SDK từ client component — chỉ pre-signed URLs
- [ ] Auth check phải server-side (`getServerSession`) — không tin client role
- [ ] Input validation bằng Zod trước khi xử lý business logic
- [ ] Không hardcode credentials/API keys vào code

---

## 8. CI/CD Pipeline

PR của bạn sẽ được kiểm tra tự động qua các bước:

| Check | Mô tả |
|-------|-------|
| **Lint & Type Check** | ESLint + `tsc --noEmit` |
| **Unit Tests** | Vitest test suite |
| **Production Build** | `next build` thành công |
| **Lint FastAPI** | Ruff + mypy cho Python code |
| **Lint n8n Workflows** | Validate JSON workflow format |
| **Docker Compose Smoke** | Build tất cả Docker images |
| **Browser Smoke** | Playwright kiểm tra login flow |

Tất cả checks phải **PASS** trước khi PR được review.

---

## 9. Liên hệ

- **Maintainer**: OpenTea Developers
- **GitHub Issues**: [OpenTea-DX-OS/issues](https://github.com/maiychrus25/OpenTea-DX-OS/issues)

---

Cảm ơn bạn đã đóng góp cho DX-AgriMarket! Mỗi đóng góp, dù lớn hay nhỏ, đều giúp cải thiện nền nông nghiệp số Việt Nam.

**Dự án:** DX-AgriMarket — Hệ điều hành số Nông nghiệp  
**Giấy phép:** MIT License  
**Copyright (c) 2026 OpenTea Developers**
