<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Hệ thống Tài liệu OpenTea DX-OS

Thư mục `docs/` là nguồn sự thật về nghiệp vụ, kiến trúc 3 tầng **DX-OS Open-Core** (mô hình **HPDI** của TS. Tạ Tuấn Anh), hợp đồng kỹ thuật và lộ trình phát triển sản phẩm cho **Hợp tác xã (HTX) Chè Việt Nam**.

---

## 1. Hướng dẫn Đọc theo Vai trò

| Vai trò | Đọc theo thứ tự | Mục tiêu |
|---|---|---|
| **PO / BA / Ban quản trị HTX** | 1. [Phân tích Nghiệp vụ (BA)](./business-analysis.md)<br>2. [Lộ trình Sản phẩm Chiến lược](./product-roadmap.md)<br>3. [ADR 0005: Chuỗi giá trị Chè & Multi-Tenant](./adr/0005-multi-tenant-tea-value-chain-dxos.md) | Hiểu đúng mô hình HPDI + Poka-yoke cho HTX chè, mô hình SaaS đa HTX, vai trò và thứ tự ưu tiên xây dựng tính năng. |
| **Kỹ sư Lõi & Mini-app** | 1. [Ngữ cảnh Dự án & Thuật ngữ](./project-context.md)<br>2. [Quy tắc & Giới hạn Cứng](./rules-and-limits.md)<br>3. [Lược đồ CSDL](./database-schema.md) & [Hợp đồng API](./api-contract.md)<br>4. [Hướng dẫn Viết Mini-app](./miniapps.md) | Nắm kiến trúc Hexagonal, rào chắn bảo mật/tenant, quy tắc đặt tên mã, hợp đồng APISIX/Hasura và AppKit. |
| **Platform / DevOps** | 1. [Cài đặt Môi trường Dev](./dev-setup.md)<br>2. [Đặc tả Tầng 1a](./specs/2026-11-08-tier1-core-platform-design.md), [1b](./specs/2026-11-08-tier1b-zero-trust-edge-design.md), [1c](./specs/2026-11-09-tier1c-data-events-design.md)<br>3. [Cấu trúc Mẫu P.A.R.A HTX Chè](./templates/para-tea-cooperative/1-projects/spring-tea-flush-2026/README.md) | Dựng hạ tầng Keycloak, APISIX, Hasura, SeaweedFS, ClamAV, Mosquitto, DataOps Parquet/DuckDB, Ollama. |
| **QA / Kiểm toán Hệ thống** | 1. [Chiến lược Kiểm thử](./testing-strategy.md)<br>2. [Sổ Ghi nhận Sai lệch (Deviation Register)](./deviation-register.md)<br>3. [Benchmark Agent](./benchmark.md) | Kiểm thử tự động, kiểm tra không hồi quy, theo dõi sai lệch đã biết và hiệu năng agent. |

---

## 2. Danh mục Tài liệu Chính thức

### Tài liệu Sống (Living Reference Documents)
- [business-analysis.md](./business-analysis.md) — Đặc tả phân tích nghiệp vụ toàn diện cho HTX Chè Việt Nam trên khung HPDI & 3 tầng DX-OS.
- [product-roadmap.md](./product-roadmap.md) — Lộ trình sản phẩm chiến lược 5 giai đoạn, ma trận vai trò – màn hình, phân loại danh mục tính năng và KPI chuyển đổi số.
- [project-context.md](./project-context.md) — Điểm vào cho AI Agent & Developer: tech stack, kiến trúc, thuật ngữ miền Chè, tài liệu tham chiếu.
- [rules-and-limits.md](./rules-and-limits.md) — Bất biến kiến trúc, giới hạn kỹ thuật, quy tắc nghiệp vụ, bảo mật và quy chuẩn mã nguồn.
- [database-schema.md](./database-schema.md) — Tài liệu tham khảo các schema PostgreSQL (`public`, `audit`, `telemetry`, `platform`, `app_*`) và đối chiếu với `schema.prisma`.
- [api-contract.md](./api-contract.md) — Hợp đồng API của Web App, Internal Agent/Telegram/Staff endpoints và Mini-app Gateway.
- [miniapps.md](./miniapps.md) — Chuẩn phát triển Mini-app Tầng 3 (`app.yaml`, AppKit, Hasura RLS, `./dxos` CLI).
- [dev-setup.md](./dev-setup.md) — Hướng dẫn khởi chạy và thiết lập môi trường phát triển cục bộ.
- [testing-strategy.md](./testing-strategy.md) — Chiến lược kiểm thử Unit, Integration, E2E Playwright và Smoke Platform.
- [deviation-register.md](./deviation-register.md) — Sổ theo dõi các sai lệch kỹ thuật & nghiệp vụ đã ghi nhận.
- [benchmark.md](./benchmark.md) — Kết quả đo kiểm bộ kịch bản Agentic AI theo từng nhà cung cấp mô hình.

### Quyết định Kiến trúc (`docs/adr/`)
- [0001-n8n-workflow-engine.md](./adr/0001-n8n-workflow-engine.md) — Sử dụng n8n làm bộ điều phối quy trình & lối thoát sang Kestra.
- [0002-miniapp-architecture.md](./adr/0002-miniapp-architecture.md) — Kiến trúc Mini-app Tầng 3 chạy tách container sau cổng APISIX.
- [0003-agentic-layer.md](./adr/0003-agentic-layer.md) — Kiến trúc lớp AI vận hành 3 vùng tin cậy & sổ kiểm toán băm.
- [0004-external-llm-providers.md](./adr/0004-external-llm-providers.md) — Tích hợp tùy chọn LLM bên ngoài với lớp che PII và ngân sách HTX.
- [0005-multi-tenant-tea-value-chain-dxos.md](./adr/0005-multi-tenant-tea-value-chain-dxos.md) — Định hướng SaaS đa HTX, chuỗi giá trị chè khép kín chuẩn DX-OS & rào chắn Poka-yoke cho con người.

### Thư mục Lịch sử, Nhật ký & Mẫu (`docs/specs/`, `docs/plans/`, `docs/timelines/`, `docs/templates/`)
- `docs/specs/` — Đặc tả thiết kế theo từng mốc triển khai (giữ nguyên nội dung lịch sử; chỉ cập nhật dòng `Trạng thái` và phụ lục định hướng khi có thay đổi).
- `docs/plans/` — Kế hoạch triển khai chi tiết tương ứng với từng đặc tả.
- `docs/timelines/` — Nhật ký công việc hàng ngày của các agent (`YYYY-MM-DD.md`), mỗi ngày một tệp ghi lại toàn bộ tác vụ đã thực hiện cho dự án.
- `docs/templates/para-tea-cooperative/` — Cấu trúc thư mục mẫu P.A.R.A dành cho HTX Chè Việt Nam.

---

## 3. Quy chuẩn Bắt buộc về Đặt tên File & Thư mục Tài liệu

Để toàn bộ dự án đồng nhất, dễ tra cứu và tự động kiểm tra qua `scripts/validate-structure.sh`, mọi file và thư mục tài liệu **bắt buộc** tuân thủ bảng quy tắc dưới đây:

| Vị trí | Quy chuẩn Đặt tên | Định dạng / Regex | Ví dụ Đúng | Cấm (Ví dụ Sai) |
|---|---|---|---|---|
| **Gốc repo** (chuẩn OSS) | `UPPER_SNAKE_CASE.md` | `^[A-Z0-9_]+\.md$` | `README.md`, `CHANGELOG.md`, `DESIGN.md`, `AGENTS.md` | `readme-vi.md`, `DesignDoc.md` |
| **Trang chỉ mục thư mục** | `README.md` | `^README\.md$` | `docs/README.md`, `miniapps/tea-shop/README.md` | `index.md`, `Muc_Luc.md` |
| **Tài liệu sống trong `docs/`** | Tiếng Anh, chữ thường `kebab-case.md` | `^[a-z0-9]+(-[a-z0-9]+)*\.md$` | `business-analysis.md`, `product-roadmap.md`, `rules-and-limits.md` | `BA_Document.md`, `roadmap_v2.md`, `TaiLieuNghiepVu.md` |
| **Quyết định Kiến trúc (`docs/adr/`)** | Số thứ tự 4 chữ số + `kebab-case.md` | `^[0-9]{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$` | `0005-multi-tenant-tea-value-chain-dxos.md` | `adr5.md`, `005-tea.md` |
| **Đặc tả thiết kế (`docs/specs/`)** | Ngày ISO + `kebab-case` + `-design.md` (hoặc `-direction.md`) | `^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$` | `2026-11-23-agentic-layer-design.md` | `spec-moi-final.md` |
| **Kế hoạch triển khai (`docs/plans/`)** | Ngày ISO + `kebab-case.md` | `^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$` | `2026-11-27-agentic-m15-voice.md` | `plan_v2.md` |
| **Nhật ký công việc ngày (`docs/timelines/`)** | Ngày ISO `YYYY-MM-DD.md` | `^[0-9]{4}-[0-9]{2}-[0-9]{2}\.md$` | `2026-11-28.md` | `timeline-28-11.md`, `2026-11-28-work.md` |
| **Thư mục mẫu (`docs/templates/**`)** | Tiếng Anh `kebab-case`, không dấu | `^[a-z0-9]+(-[a-z0-9]+)*$` | `para-tea-cooperative/1-projects/spring-tea-flush-2026/` | `Kho_Tai_Nguyen_HTX/Vu_Lua_Dong_Xuan_2026/` |

### Quy tắc Bảo toàn & Ngôn ngữ Tài liệu
1. **Định danh tệp tin & thư mục chỉ dùng tiếng Anh không dấu**, không khoảng trắng, không ký tự đặc biệt ngoài dấu gạch ngang `-` (ngoại trừ các file chuẩn OSS ở gốc repo).
2. **Không tạo file rác phiên bản:** Tuyệt đối không đặt hậu tố `.bak`, `.old`, `.orig`, `-v2`, `-v3`, `-final`, `-copy`. Lịch sử thay đổi do Git quản lý.
3. **Không viết lại thân tài liệu lịch sử:** Khi một đặc tả cũ trong `docs/specs/` bị thay thế hoặc điều chỉnh định hướng, giữ nguyên phần thân lịch sử, chỉ cập nhật dòng `> **Trạng thái:**` ở đầu file và thêm mục ghi chú định hướng ở cuối file.
4. **Kiểm tra tự động:** Chạy `bash scripts/validate-structure.sh` để xác minh toàn bộ cây tài liệu tuân thủ quy chuẩn trước khi gửi Pull Request.
