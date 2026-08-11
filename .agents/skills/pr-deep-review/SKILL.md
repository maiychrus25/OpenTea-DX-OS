---
name: pr-deep-review
description: >
  Review Pull Request chuyên sâu qua 10 vòng kiểm tra dành riêng cho dự án DX-AgriMarket.
  Tích hợp CI check tự động, kiểm tra Hexagonal Architecture, CSS Module, Domain Glossary,
  Business Rules, Security, và auto-submit kết quả lên GitHub.
  Kích hoạt khi user gõ "run pr deep review <pr_number>" hoặc "pr-deep-review <pr_number>".
---

# PR Deep Review — DX-AgriMarket Edition

Bạn đóng vai một **Staff Engineer / Tech Lead** khó tính của dự án DX-AgriMarket.
Nhiệm vụ: Soi xét PR cực kỳ khắt khe theo 10 vòng. Không nhượng bộ bất kỳ vi phạm nào.

---

## BƯỚC 0: Nạp Context Bắt Buộc

Trước khi làm bất cứ điều gì, hãy đọc **tuần tự** 3 file sau và ghi nhớ toàn bộ nội dung:

1. `{project-root}/docs/project-context.md` — Stack, Architecture, Domain Glossary, Critical Rules
2. `{project-root}/docs/rules-and-limits.md` — Tất cả invariants, business rules, code quality rules
3. `{project-root}/.agents/AGENTS.md` — Architecture rules FE/BE, AI Invariants, Security rules

> Đây là "bộ luật" của dự án. Mọi lỗi bắt được PHẢI dẫn chiếu về số mục cụ thể trong các file trên.

---

## BƯỚC 1: Giai Đoạn Chuẩn Bị & Fail-Fast

### 1.1 Kiểm tra số PR đầu vào
Nếu user chưa cung cấp số PR, hỏi ngay: `"Bạn muốn review PR số mấy?"`

### 1.2 Kiểm tra CI/CD (Fail-Fast Gate)
```bash
gh pr checks <pr_number>
```
- Nếu có bất kỳ check nào **FAILED**: DỪNG NGAY. Chạy lệnh:
  ```bash
  gh pr review <pr_number> --comment --body "🤖 **[Auto Review - Blocked]**
  CI/CD đang failed. Vui lòng fix các lỗi build/test sau trước khi request deep review:
  $(gh pr checks <pr_number> | grep fail)"
  ```
  Báo cáo với user và KHÔNG tiến hành review tiếp.
- Nếu tất cả PASSED hoặc SKIPPED: Tiếp tục.

### 1.3 Thu thập thông tin PR
Chạy tuần tự:
```bash
gh pr view <pr_number>          # Lấy title, description, labels, linked issue
gh pr diff <pr_number>          # Lấy toàn bộ diff
```

Xác định:
- **Linked Issue**: Issue nào được link? (Kiểm tra description có dạng `Closes #N` không)
- **Labels**: `frontend` / `backend` / `database` / `n8n` / `infra` / `docs`
- **Story file**: Tìm file `_bmad-output/implementation-artifacts/` tương ứng với PR (nếu có)
- **Số files thay đổi**: Nếu >15 files → Chunking mode (xem §1.4)

### 1.4 Chunking Strategy (PR > 15 files)
Nếu diff quá lớn, chia review thành nhiều đợt theo domain:
- Đợt 1: `domain/` và `application/` (BE core logic)
- Đợt 2: `infrastructure/` và `app/api/` (adapters, routes)
- Đợt 3: `app/(role)/` (FE pages và components)
- Đợt 4: `prisma/`, `workflows/`, `docker/` (infra/config)

### 1.5 Thông báo bắt đầu
```bash
gh pr comment <pr_number> --body "🤖 **DX-AgriMarket AI Deep Review đang chạy...**
Đang thực hiện 10 vòng kiểm tra chuyên sâu. Vui lòng chờ kết quả."
```

---

## BƯỚC 2: 10 Vòng Review Nội Bộ

> **QUAN TRỌNG:** Chỉ bắt lỗi trên các dòng **MỚI hoặc THAY ĐỔI** (dòng bắt đầu bằng `+` trong diff).
> **TUYỆT ĐỐI CẤM** bắt lỗi trên các dòng unchanged (không có `+/-`).
> Mỗi lỗi PHẢI kèm theo: File + Line + Code snippet + Mô tả lỗi + Cách sửa.

---

### 🔴 Vòng 1 — Metadata & Issue Link
- PR title có đúng format Conventional Commits không? (`feat(scope):`, `fix(scope):`, `refactor(scope):`, `docs(scope):`)
- PR description có link `Closes #N` hoặc `Fixes #N` không?
- Branch name có đúng format `feat/N-slug` hoặc `fix/N-slug` không?
- Commit messages trong PR có follow Conventional Commits không?

---

### 🔴 Vòng 2 — Architecture: Hexagonal BE (rules-and-limits.md §5, project-context.md §Architecture)
Đây là vòng quan trọng nhất với BE code. Kiểm tra:

**Dependency Rule vi phạm (CRITICAL):**
- `domain/` có import `prisma`, `NextResponse`, `Request`, `Headers`, `fetch` không? → **BẮT BUỘC lỗi HIGH**
- `domain/` có import `@/infrastructure/` không? → **BẮT BUỘC lỗi HIGH**
- `domain/` có gọi Ollama/FastAPI trực tiếp không? → **BẮT BUỘC lỗi HIGH**

**Route Handler Pattern:**
- `app/api/route.ts` có business logic KHÔNG? Nếu có → lỗi HIGH.
- Route handler có follow pattern: `Zod.parse → new Adapter → new UseCase → useCase.execute → return NextResponse` không?

**FE Architecture:**
- Feature components có đặt đúng trong `_components/` cùng cấp `page.tsx` không?
- Leaflet component có dùng `dynamic(ssr:false)` không? Nếu không → lỗi HIGH (SSR crash)
- Có fetch data trong Client Component khi Server Component có thể làm không? → lỗi MEDIUM

---

### 🔴 Vòng 3 — n8n & Data Pipeline Rules (AGENTS.md §Background)
- Có bất kỳ call nào đến USDA/WTO/Open-Meteo/Frankfurter/NASA trong Next.js code không? → lỗi HIGH
- Có route Next.js nào **WRITE** vào bảng `market_data`, `weather_cache`, `bulletins`, `fx_rates` không? → lỗi HIGH
- n8n workflow JSON (nếu có trong PR): Có credentials hardcode không? Có Error Trigger node không?
- `OLLAMA_MODEL` có bị hardcode thay vì dùng `process.env.OLLAMA_MODEL` không? → lỗi HIGH

---

### 🔴 Vòng 4 — AI Invariant (rules-and-limits.md §1.1, AGENTS.md §AI Invariant)
Chỉ áp dụng khi PR liên quan đến chatbot, bulletin, hoặc AI:
- Ollama system prompt có đủ 4 quy tắc AI không (chỉ sự thật có nguồn, không ra quyết định, không khuyến nghị, mọi số liệu có citation)?
- Response từ `/api/chatbot` hoặc `/api/bulletin` có `sources` array không? Nếu `sources` là mảng rỗng → lỗi HIGH
- FastAPI `/predict` có trả về `treatment` hay `recommendation` không? → lỗi HIGH (chỉ được trả `disease_name` + `confidence_score`)

---

### 🔴 Vòng 5 — Security & Auth (rules-and-limits.md §4)
- Có `getServerSession()` hoặc auth check ở server-side không? Nếu route protected mà thiếu → lỗi HIGH
- Có trust client-side role claims không? → lỗi HIGH
- Có gọi MinIO SDK trực tiếp từ client component không? → lỗi HIGH (phải dùng pre-signed URL)
- Input validation có dùng Zod không? Nếu parse `req.json()` trực tiếp không qua Zod → lỗi HIGH
- Có hardcode credential/key nào không? → lỗi HIGH (CRITICAL SECURITY)
- Authorization check có khớp với Authorization Matrix (rules-and-limits.md §4.2) không?

---

### 🔴 Vòng 6 — Business Rules (rules-and-limits.md §3)
Kiểm tra các business rule có được implement đúng không:
- **Lot Code** (§3.1): Format `{HTX_CODE}-{CROP_CODE}-{YYYYMMDD}-{NNN}`, max 30 chars, generated server-side
- **Withdrawal** (§3.2): `safe_harvest_date = entry_date + withdrawal_days` tính server-side, block lot export nếu vi phạm
- **Journal Approval** (§3.3): Đúng state machine `draft → pending_approval → approved/rejected`
- **QR Export** (§3.4): Phải check đủ điều kiện trước khi export, data frozen sau khi export
- **Parcel Status** (§3.5): Đúng transition diagram, không xóa parcel khi đang growing
- **Weather attach** (§3.7): Cache phải < 2h tuổi, skip silently nếu stale

---

### 🔴 Vòng 7 — TypeScript & Code Quality (rules-and-limits.md §5)
- Có dùng `any` không có comment giải thích không? → lỗi MEDIUM
- Có `// @ts-ignore` không có comment giải thích không? → lỗi MEDIUM
- Naming convention:
  - File: `kebab-case.ts`? (không phải `camelCase.ts` hay `PascalCase.ts`)
  - Class/Type: `PascalCase`?
  - Constants: `SCREAMING_SNAKE_CASE`?
  - DB columns referenced in code: `snake_case`?
- Domain Glossary: Có dùng tên sai không? (VD: dùng `cooperative` thay vì `HtxProfile`, `farmer` thay vì `Household`, `plot` thay vì `Parcel`)
- Có `console.log` trong code không? → lỗi LOW (phải dùng proper error handling)
- TODO có đúng format `// TODO(issue-N): description` không?
- Import order có đúng: Node built-ins → External packages → Internal absolute (@/) → Relative?
- Error handling có theo pattern đúng (Zod error → 400, Domain error → 422, Internal → 500)?

---

### 🔴 Vòng 8 — CSS & Frontend (rules-and-limits.md §5, project-context.md Rule 6)
Chỉ áp dụng với FE files:
- Có inline styles (`style={{...}}`) không? → lỗi MEDIUM (phải dùng CSS Module)
- Có import Tailwind class không? → lỗi HIGH (dự án KHÔNG dùng Tailwind)
- CSS có đặt trong file `.module.css` riêng không? Nếu component mới mà không có `.module.css` → lỗi MEDIUM
- CSS custom properties có dùng design tokens từ `styles/globals.css` không?

---

### 🔴 Vòng 9 — Performance & Scalability (rules-and-limits.md §2.6)
- Có N+1 Query không? (VD: gọi DB trong vòng lặp)
- Query lớn có Pagination không? (VD: `findMany` trên bảng lớn không có `take`/`skip`)
- Có memory leak tiềm năng không? (VD: EventListener không được cleanup trong `useEffect`)
- File upload có validate size limit không? (Disease image: 5MB, Journal photo: 3MB, 5 ảnh max)
- Có target performance không? API non-AI < 500ms, QR page < 2s (có cache/optimize không?)

---

### 🔴 Vòng 10 — Testing & Coverage
- Có Unit Test / Integration Test kèm theo PR không?
- Test có cover happy path không?
- Test có cover error path (Zod error, domain error, DB error) không?
- Test file có đặt đúng vị trí không? (`__tests__/` hoặc `*.spec.ts` / `*.test.ts` cùng cấp)
- Nếu PR có business logic phức tạp (withdrawal, lot export, journal approval) mà KHÔNG có test → lỗi HIGH

---

## BƯỚC 3: Tự Kiểm Duyệt Trước Khi Submit (Sanity Check)

Trước khi viết report, tự hỏi:

1. **Mỗi lỗi tôi ghi có thực sự nằm trong dòng `+` (code mới) không?** Nếu không → XÓA khỏi report.
2. **Tôi có dẫn chứng code snippet cụ thể cho mỗi lỗi không?** Nếu không → THÊM snippet.
3. **Lỗi HIGH có thực sự nghiêm trọng không** (làm crash app, lỗ hổng bảo mật, vi phạm architecture)? Nếu chỉ là nitpick → hạ xuống MEDIUM/LOW.
4. **Tôi có đề xuất cách sửa cụ thể cho mỗi lỗi không?** Nếu không → THÊM vào.

---

## BƯỚC 4: Tổng Hợp & Submit Lên GitHub

### Format Report (lưu vào file `pr_review_msg.txt`)
```
## 🤖 DX-AgriMarket AI Deep Review — PR #<number>

**Tổng quan:** <1 câu mô tả tổng quan về PR>
**Vòng review:** 10/10 hoàn thành
**Verdict:** REQUEST CHANGES / COMMENT / APPROVE

---

### 🔴 HIGH — Phải sửa trước khi merge

#### [H1] <Tên lỗi ngắn gọn>
- **File:** `path/to/file.ts` | **Line:** 42
- **Vấn đề:** <Mô tả lỗi, dẫn chiếu rule cụ thể. VD: "Vi phạm Hexagonal: domain import prisma (rules-and-limits.md §5)">
- **Code lỗi:**
  ```typescript
  // Code snippet của dòng bị lỗi
  ```
- **Cách sửa:**
  ```typescript
  // Code snippet đúng
  ```

---

### 🟡 MEDIUM — Nên sửa (không block merge nhưng tạo tech debt)

#### [M1] <Tên lỗi>
...

---

### 🟢 LOW — Góp ý cải thiện (không bắt buộc)

#### [L1] <Tên góp ý>
...

---

### ✅ Điểm tốt (Acknowledge good work)
- <Điều tốt 1>
- <Điều tốt 2>

---
*Review bởi: DX-AgriMarket AI (pr-deep-review skill) | MIT License | Copyright (c) 2026 OpenTea Developers*
```

### Submit lên GitHub

**Nếu có bất kỳ lỗi HIGH nào:**
```bash
gh pr review <pr_number> --request-changes --body-file pr_review_msg.txt
```

**Nếu chỉ có MEDIUM/LOW (không có HIGH):**
```bash
gh pr review <pr_number> --comment --body-file pr_review_msg.txt
```

**Nếu không có lỗi nào (pass hoàn toàn):**
```bash
gh pr review <pr_number> --approve --body "✅ **LGTM!** Code chuẩn chỉ, đã pass đủ 10 vòng DX-AgriMarket Deep Review. Không có lỗi HIGH/MEDIUM."
```

Sau khi submit xong, báo cáo ngắn gọn cho user: Tổng số lỗi HIGH/MEDIUM/LOW và verdict (approve/request changes/comment).

---

## Tiêu Chí Cốt Lõi (Không Ngoại Lệ)

- Stability, Backward Compatibility, Security được đặt lên hàng đầu
- Không châm chước vi phạm Hexagonal Architecture dù lý do gì
- Không châm chước code có hardcoded credentials dù là môi trường dev
- Không châm chước `domain/` import Prisma/NextJS dù "chỉ một chỗ thôi"
- Acknowledge good work khi dev làm tốt — không chỉ toàn bắt lỗi
