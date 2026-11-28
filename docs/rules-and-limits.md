# Rules & Limits — OpenTea DX-OS

> Tài liệu này định nghĩa tất cả **ràng buộc cứng** của hệ thống **OpenTea DX-OS** (tuân thủ kiến trúc DX-OS Open-Core & lộ trình [product-roadmap.md](./product-roadmap.md)).
> Agent và developer PHẢI đọc file này trước khi implement bất kỳ feature nào.
> Mọi vi phạm đều cần justification rõ ràng và approval từ team lead / PO.

---

## 1. Invariants (Không được vi phạm dưới bất kỳ hoàn cảnh nào)

### 1.1 AI Principle Invariant
```
Chế độ thường:
- AI được đề xuất hành động nằm trong danh mục hành động (action catalogue).
- AI KHÔNG bao giờ tự thực thi.
- Mọi đề xuất kèm lý do và nguồn; người duyệt chịu trách nhiệm quyết định.

Chế độ tự vận hành (tuỳ chọn, mặc định tắt, do manager bật và chịu trách nhiệm):
- AI tự thực thi hành động trong danh mục trong các ngưỡng và 5 giới hạn cứng H1–H5 của đặc tả §11.
- **Rào chắn Poka-yoke định hướng chiến lược ([ADR 0005](./adr/0005-multi-tenant-tea-value-chain-dxos.md)):** Các quyết định **An toàn thực phẩm** (`harvest.approve`, nghiệm thu cách ly PHI) và **Tài chính/Giá cả** (thanh toán xã viên, khuyến mãi) thuộc phạm vi bắt buộc có người duyệt ký cuối cùng khi triển khai thực tế tại HTX.

Giữ nguyên cho chatbot, bản tin, hỏi đáp và nhận diện bệnh:
- Chatbot, bản tin và hỏi đáp CHỈ tổng hợp và trình bày sự thật có trích dẫn nguồn.
- Mọi số liệu phải kèm citation: (Nguồn: USDA, ngày DD/MM/YYYY).
- FastAPI /predict KHÔNG trả về treatment recommendation — chỉ disease_name + confidence.
```

**Enforcement trong code:**
- Ollama system prompt PHẢI chứa quy tắc chỉ tổng hợp sự thật có trích dẫn nguồn (xem ARCHITECTURE-SPINE §7.4)
- Response từ `/api/chatbot` và `/api/bulletin` PHẢI chứa `sources` array
- FastAPI `/predict` KHÔNG trả về treatment recommendation — chỉ `disease_name` + `confidence`
- Mọi đề xuất hành động đi qua danh mục hành động và bước duyệt trong `apps/web`, được ghi vào `audit.events` (xem [ADR 0003](./adr/0003-agentic-layer.md) và đặc tả `docs/specs/2026-11-23-agentic-layer-design.md`)

### 1.2 MNM (Mã Nguồn Mở) Invariant
```
100% thành phần phải có license MNM-compatible.
Không có phụ thuộc bắt buộc nào vào dịch vụ trả phí. Provider trả phí là tuỳ chọn, mặc định tắt, bật theo từng HTX. Dựng và chạy thử từ mã nguồn không cần khoá nào.
KHÔNG bundle binary proprietary vào source code.
KHÔNG hardcode credentials vào bất kỳ file nào được commit.
```

**Verified MNM stack:** Xem PRD §8 License Compliance Matrix và [ADR 0004](./adr/0004-external-llm-providers.md).

> **Lưu ý chuyển tiếp:** Chatbot hiện tại tự chuyển sang Groq khi có `GROQ_API_KEY`; cơ chế này có từ trước khi lớp provider dùng chung được thiết kế và sẽ chuyển sang dùng chung lớp provider cùng chính sách dữ liệu trong đặc tả §3, §8.3.

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
Example: TC-CHE-20261128-001

Rules:
- HTX_CODE: uppercase, max 6 chars, from htx_profiles.htx_code
- CROP_CODE: uppercase, max 8 chars, ASCII alphanumeric only (stripped of Vietnamese diacritics)
- YYYYMMDD: harvest date
- NNN: sequential 3-digit, reset daily per HTX per crop
- Total length: max 30 characters
- UNIQUE constraint enforced in DB
```

### 3.2 Pesticide Withdrawal Calculation
```
safe_harvest_date = entry_date + withdrawal_days (server-side, 24 giờ mỗi ngày; không tin giá trị từ client)

Rules:
- Mọi lần phun (SPRAYING) đều có withdrawal_days: không bao giờ trống, không bao giờ thấp hơn mức sàn của thuốc.
- Vi phạm mức sàn → 422 WITHDRAWAL_BELOW_FLOOR.
- Lô không tạo hoặc xuất QR được khi còn lần phun trong cách ly (xem quy tắc (b)) → WITHDRAWAL_NOT_PASSED.
- Display in UI: "Cách ly: X ngày — An toàn thu hoạch từ: DD/MM/YYYY"
```

Nhật ký `DRAFT` hoặc `REJECTED` không tính vào thời gian cách ly; `PENDING_APPROVAL`, `APPROVED`, `REQUEST_CHANGES` vẫn tính (`WITHDRAWAL_EXCLUDED_STATUSES`).

**Hai quy tắc ngày (`apps/web/src/domain/journal/blocking-sprays.ts`).** Dư lượng thuốc nằm trong cây chè, không theo ranh giới lứa hái, nên `cycle_id` không giới hạn quy tắc (a).

- **(a) Nương đang mở (`openParcelBlock`), xét tại ngày D.** Mọi lần phun của nương có `entry_date <= D` và `safe_harvest_date > D` đều chặn, bất kể `cycle_id`. Dùng ở: `POST /api/parcels/[id]/approve-harvest` (D = lúc gọi), cờ `canApprove` của lịch thu hái, và bàn cân (D = cuối ngày Việt Nam của ngày cân; mục 3.22).
- **(b) Dòng lô đã thu hoạch (`lotLineBlock`), ngày hái H.** Một lần phun tính khi `safe_harvest_date > H` **và** (`cycle_id` bằng lứa của dòng lô **hoặc** `entry_date <= H`). Lần phun của lứa sau, làm sau ngày hái, không khoá lô cũ; thuốc phun trước ngày hái vẫn chặn đủ. Dòng lô cũ không có `cycle_id` chỉ xét theo điều kiện ngày. Dùng ở: tạo lô (`POST /api/lots`, lỗi `WITHDRAWAL_NOT_PASSED`), xuất QR và trang truy xuất lô (`is_harvest_safe`).
- **Cách so ngày.** Bàn cân so theo ngày lịch giờ Việt Nam (`Asia/Ho_Chi_Minh`): đúng ngày hết cách ly thì được cân. Duyệt thu hoạch và lô so thời điểm (lúc gọi, hoặc `harvest_date` của lô), không đổi sang ngày lịch: `POST /api/parcels/[id]/approve-harvest` so với thời điểm hiện tại, không so với ngày Việt Nam. Tổng quan nông dân, tổng quan cán bộ và ứng viên chiến dịch chưa được đối chiếu lại với quy tắc (a) trong nhánh này; mã của chúng không đổi.

**Danh mục thuốc BVTV (`pesticide_products`).**

- Danh mục khởi đầu 20 thuốc, chép từ Hướng dẫn 528/CCTTBVTV-TTBVTV (Chi cục TT&BVTV Thái Nguyên) và chỉ đạo phòng trừ vụ Xuân 2026; không thêm tên nào ngoài các nguồn đó.
- **Mức sàn mặc định** `default_phi_days` theo nhóm: thảo mộc (`BOTANICAL`), vi sinh (`MICROBIAL`), sinh học (`BIOLOGICAL`) 7 ngày; hoá học (`CHEMICAL`), kháng sinh (`ANTIBIOTIC`) 14 ngày. Mọi dòng mang cờ `phi_needs_label_check` và hiển thị "Mức sàn mặc định — cần đối chiếu nhãn thực tế" cho đến khi có người đối chiếu nhãn.
- **Ai đặt số ngày thật theo nhãn.** `platform_admin` sửa danh mục chung (`default_phi_days`, cờ đối chiếu nhãn, `active`) qua `PUT /api/platform/pesticides/[id]`. Cán bộ kỹ thuật (`officer`) và Trưởng HTX (`manager`) đặt hoặc xoá nhãn riêng của HTX (`htx_pesticide_labels`, 1 đến 365 ngày) qua `PUT` và `DELETE /api/pesticides/[id]/label`. Nhãn của HTX thay mức sàn mặc định cho HTX đó; nhãn được thấp hơn mức mặc định nhưng phải có `label_note` (số lô hoặc nội dung nhãn), nếu không trả 422 `DOMAIN_ERROR`.
- **Nông dân không hạ được dưới mức sàn.** Sàn hiệu lực là nhãn của HTX nếu có, nếu không là `default_phi_days`. Thiếu số ngày thì hệ thống điền mức sàn; số ngày thấp hơn thì trả 422 `WITHDRAWAL_BELOW_FLOOR`.
- **"Thuốc khác".** Lần phun không có `pesticide_product_id` (kể cả khi chỉ có tên thuốc mà không khớp tên thương mại trong danh mục) có sàn 14 ngày (`CUSTOM_PRODUCT_FLOOR_DAYS`). Kênh chỉ gửi tên (Telegram) được khớp danh mục theo tên thương mại, không phân biệt hoa thường. Agent soát nhật ký A1 không đề xuất duyệt nhật ký phun có thuốc ngoài danh mục: các nhật ký đó nằm ngoài đề xuất và chờ cán bộ xem (lý do "Thuốc ngoài danh mục").
- Nhật ký đã lưu không bị kiểm lại: `PUT /api/journal/[id]` chỉ chạy kiểm mức sàn khi thân request có `activities`. `withdrawal_days` và `safe_harvest_date` được chốt lúc ghi; đổi nhãn sau đó không tính lại nhật ký cũ.

### 3.3 Journal Approval Flow
```
States: draft → pending_approval → approved | rejected | request_changes

Rules:
- Only officer/farmer can CREATE (`POST /api/journal`). Farmer entries start as PENDING_APPROVAL; officer entries start as APPROVED. DRAFT exists only for an officer prescription (below).
- Officer and manager can APPROVE or REJECT / REQUEST_CHANGES (pending_approval → approved/rejected/request_changes)
- Rejecting or requesting changes keeps the entry out of APPROVED (`REJECTED` or `REQUEST_CHANGES`) and stores the reason in `review_note`
- APPROVED entry cannot be edited or deleted
- REJECTED and REQUEST_CHANGES entries can be edited and re-submitted by the farmer
- Batch approve: max 50 entries per request
```

- **"Sửa lại" (nông dân).** Nhật ký `REQUEST_CHANGES` hoặc `REJECTED` có nút "Sửa lại" mở `/farmer/journal/[id]/edit`. Lưu bằng `PUT /api/journal/[id]` với `submit: true`: trạng thái về `PENDING_APPROVAL`, `review_note` và `reviewed_by_id` bị xoá, cán bộ nhận thông báo, hạn cách ly tính lại theo ngày ghi. Chỉ nông dân của hộ có nương gửi lại được (cán bộ gọi `submit` nhận 403).
- **Hàng đợi offline (nông dân).** Form nhật ký của nông dân khi mất mạng lưu mục vào IndexedDB (`journal_offline_queue`) kèm `client_id` (UUID) và gửi lại khi có mạng. Mục bị máy chủ từ chối bằng 4xx (trừ 401, 408, 429) chuyển sang danh sách "Chưa gửi được" để sửa hoặc bỏ; 5xx và 401, 408, 429 ở lại hàng đợi. Chống trùng bằng khoá duy nhất `(submitted_by_id, client_id)`: gửi lại cùng `client_id` trả 200 với nhật ký đã có, không tạo bản thứ hai.
- **Kê đơn của cán bộ.** Ở `/officer/diseases`, cán bộ xác nhận ca bệnh (`CONFIRMED`) có thể chọn một thuốc trong danh mục. Hệ thống tạo ngay một nhật ký `DRAFT` loại `SPRAYING` cho nương của ca bệnh, với số ngày cách ly bằng mức sàn hiệu lực của HTX, ghi chú `Theo kê đơn ca bệnh <id>`, và thông báo cho nông dân. Bản nháp chưa có lứa và không tính vào cách ly. Nông dân bấm "Đã phun" (`submit: true`): người gửi và `performed_by` đổi thành nông dân, `safe_harvest_date` tính lại từ ngày ghi, lứa được gán lúc gửi.
- **"Nghiệm thu đạt cách ly".** Lịch thu hái và hồ sơ hộ của cán bộ (không hiện cho nông dân) có nút này cho lứa đang mở của nương `TENDING`; nút chỉ bật khi `canApprove` (không còn lần phun chặn theo quy tắc (a) mục 3.2). Bấm gọi `POST /api/parcels/[id]/approve-harvest` (`officer` hoặc `manager`), chuyển nương sang `HARVEST_APPROVED`. Còn cách ly thì trả 422 `DOMAIN_ERROR` kèm ngày an toàn.
- **Hoạt động mới.** `PRUNING` (Đốn chè) đưa nương về `TENDING` như chăm sóc khác. Hoạt động `HARVEST` có thể ghi `fresh_leaf_kg` (kg búp tươi, lớn hơn 0 và tối đa 100000); các loại khác gửi trường này bị 400.

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
apps/web/prisma/schema.prisma:
  SOWING → TENDING → HARVEST_APPROVED → HARVESTED (hoặc FALLOW)
  Officer mở lứa mới từ HARVESTED → TENDING bằng POST /api/parcels/[id]/start-round (tạo ParcelCropCycle tiếp theo).

Đích chuẩn Ngành Chè (Lộ trình GĐ1 — ADR 0005):
  TENDING → HARVEST_APPROVED (khi đạt cách ly) → HARVESTED → tự động mở ParcelCropCycle lứa kế tiếp
  (Chè là cây lưu niên hái 7–9 lứa/năm; nhật ký và lô gắn trực tiếp cycle_id để không khóa chéo giữa các lứa).

Rule: Cannot delete parcel with active crop cycle
```

**Lứa hái (`parcel_crop_cycles`, GĐ1 S1).** Mỗi lứa là một dòng `parcel_crop_cycles` (`season` dạng `Lứa n/năm`, `sowed_at`, `harvested_at`).

- **Gắn lứa.** `journal_entries.cycle_id` và `lot_parcels.cycle_id` trỏ tới lứa. Nhật ký `HARVEST` gắn vào lứa mở mới nhất (nếu không còn lứa mở thì lứa mới nhất) và lứa đó đóng (`harvested_at`) khi nhật ký có hiệu lực (cán bộ ghi, hoặc được duyệt); `SOWING` gắn vào lứa mở, nếu chưa có thì mở lứa kế tiếp; các hoạt động khác gắn theo `entry_date`: lứa bắt đầu muộn nhất không sau ngày đó (bắt đầu = `sowed_at`, nếu trống thì `created_at`). Nếu không lứa nào bắt đầu trước ngày ghi thì lấy lứa sớm nhất.
- **Tự mở lứa kế tiếp.** Khi lứa gắn theo ngày đã đóng và `entry_date` sau `harvested_at`, hệ thống mở lứa mới (`sowed_at` là lúc mở). Chỉ tạo lứa: trạng thái nương chỉ đổi khi nhật ký được duyệt, `HARVESTED` không tự chuyển sang `TENDING`. Một lần phun ghi bù trước ngày hái vẫn thuộc lứa đã hái. Nương không có lứa nào (dữ liệu cũ) có `cycle_id` rỗng và vẫn được kiểm cách ly theo cả nương.
- **Nháp không có lứa.** Nhật ký `DRAFT` (kể cả nháp kê đơn) không mở lứa và có `cycle_id` rỗng; lứa được gán khi gửi (`submit`) hoặc khi ngày ghi đổi.
- **Hoạt động `PRUNING`** (Đốn chè) là chăm sóc: nương về `TENDING` khi nhật ký được duyệt, và nhật ký này gắn lứa theo ngày như bón phân hay phun thuốc.
- **Cách ly không theo lứa.** Lứa chỉ là khung thời gian; số ngày cách ly xét theo hai quy tắc ngày ở mục 3.2, không chỉ theo `cycle_id`.

### 3.6 HTX Profile Rules (Multi-Tenant)
```
- Hệ thống vận hành theo kiến trúc Multi-Tenant (SaaS Đa HTX & Cụm Liên minh Tỉnh): nhiều HTX dùng chung hạ tầng, cách ly tuyệt đối theo `htx_code` tại Keycloak claim, APISIX, Hasura RLS, Core TenantGuard và mọi schema `app_*`.
- htx_code: uppercase, max 6 chars, alphanumeric, set on HTX onboarding
- htx_code CANNOT be changed after first lot is exported (lot_code dependency)
- total_area_ha: auto-calculated from sum of parcel areas (per HTX)
- member_count: auto-calculated from count of households (per HTX)
```

### 3.7 Weather Auto-attach Rule
```
When journal entry is created:
- System queries weather_cache WHERE parcel_id = entry.parcel_id
- If cache exists and fetched_at > NOW() - 2h: attach to entry
- If cache stale or missing: skip silently (do not block entry creation)
- Officer can manually override temperature_c and rainfall_mm
```

### 3.8 Ngưỡng mặc định của agent soát nhật ký (A1)

Agent A1 (`platform/agent/dxos_agent/agents/journal_review.py`) giữ các ngưỡng mặc định trong `DEFAULT_THRESHOLDS`. Tham số `thresholds` khi chạy có thể ghi đè từng ngưỡng.

| Ngưỡng | Mặc định | Quyết định khi kích hoạt |
|---|---|---|
| `max_dosage_value` | 500 | Liều lượng có số ngoài khoảng (0, 500] → REQUEST_CHANGES, mã DOSAGE, đề nghị kiểm tra lại. Không từ chối, vì ngưỡng không có đơn vị. |
| `heavy_rain_mm` | 20 mm | Phun thuốc khi lượng mưa từ 20 mm trở lên → REQUEST_CHANGES, mã INCONSISTENT |
| `future_entry_tolerance_hours` | 1 giờ | Ngày ghi nhật ký vượt thời điểm hiện tại quá 1 giờ → REQUEST_CHANGES, mã INCONSISTENT |
| Số ngày cách ly (`withdrawal_days`) | Không có mức tối thiểu | Thiếu hoặc âm → REQUEST_CHANGES, mã MISSING_INFO. Số ngày ngắn hợp lệ không bị loại. |
| Kiểm tra cách ly | Theo ngày lịch Việt Nam | Phun thuốc bị REJECTED, mã WITHDRAWAL_PERIOD khi ngày thu hoạch (thực tế hoặc dự kiến) nằm trong khoảng từ ngày phun đến trước ngày an toàn. Thu hoạch đúng ngày an toàn được phép. |
| `MAX_BATCH_APPROVE` | 50 | Giới hạn kỹ thuật, không phải quyết định nghiệp vụ. Lô duyệt lớn hơn được chia thành nhiều đề xuất. |

Liều lượng được đọc theo định dạng tiếng Việt: "1.200 ml" và "1 200 ml" là 1200, dấu phẩy là dấu thập phân ("1,5 kg" là 1,5). Dấu chấm theo sau bởi một hoặc hai chữ số cũng là dấu thập phân ("0.5 kg" là 0,5), vì nông hộ gõ cả hai kiểu.

### 3.9 Provider bên ngoài: ngân sách và dữ liệu gửi đi

Provider bên ngoài (Anthropic, OpenAI) tắt mặc định và chỉ bật cho từng agent của từng HTX. Lớp agent và web thực thi các giới hạn dưới đây.

| Quy tắc | Giá trị | Hành vi khi kích hoạt |
|---|---|---|
| Ngân sách tháng | Quản lý HTX đặt bằng USD; để trống nghĩa là không có trần | Tổng `cost_estimate` của các lần chạy trong tháng theo lịch Việt Nam |
| Cảnh báo | 80% ngân sách tháng | Gửi một tin Telegram cho quản lý và hiện biểu ngữ trong hộp thư; mỗi ngưỡng chỉ báo một lần mỗi tháng |
| Dừng gọi provider | 100% ngân sách tháng | Agent không gọi provider bên ngoài cho phần còn lại của tháng và dùng Ollama |
| Che dữ liệu | Số điện thoại (`0` hoặc `+84` theo sau 9–10 chữ số, có thể có dấu cách hoặc dấu chấm), e-mail, số CCCD 9 hoặc 12 chữ số | Thay bằng `[đã ẩn]` trước khi gửi |
| Dữ liệu gửi đi | Chỉ các trường agent đã gửi cho Ollama; không gửi ảnh, tên hay số điện thoại của nông hộ | Ghi chú của nông hộ là dữ liệu không đáng tin, không bao giờ là mệnh lệnh |
| Kiểm toán | Mỗi lần chạy có gọi provider bên ngoài ghi một sự kiện `agent.external_call` | Ghi provider, model, agent và số dòng bằng chứng; không ghi nội dung |

Ollama không bị che dữ liệu vì dữ liệu không rời máy chủ của HTX.

### 3.10 Ngưỡng và mẫu tin của agent M4 (A2–A5)

Các ngưỡng mặc định nằm trong `thresholds` của từng agent và có thể ghi đè theo HTX. Giá trị này trùng với ngưỡng cảnh báo của Tea IoT Station (`apps/tea-iot/src/TeaIot.Core/Alerts.cs`) và ngưỡng mất tín hiệu của bảng điều khiển HTX.

| Agent | Ngưỡng | Mặc định | Quyết định khi kích hoạt |
|---|---|---|---|
| A2 `field-watch` | `silent_hours` | 6 giờ | Cảm biến không gửi số đo quá ngưỡng → đề nghị `notification.internal` (mẫu `sensor_silent`) |
| A2 | `dry_soil_pct` | 35 % | Độ ẩm đất dưới ngưỡng → `notification.households` (mẫu `dry_soil`) |
| A2 | `heat_c` | 35 °C | Nhiệt độ không khí trên ngưỡng → mẫu `heat` |
| A2 | `frost_c` | 4 °C | Nhiệt độ không khí dưới ngưỡng → mẫu `frost` |
| A2 | `heavy_rain_mm` | 15 mm | Dự báo mưa từ ngưỡng trở lên trong ngày sau lần phun gần đây → mẫu `rain_after_spray` |
| A2 | `spray_lookback_days`, `forecast_days` | 2 ngày, 2 ngày | Phạm vi xét lần phun gần đây và dự báo |
| A2 | `fresh_reading_hours` | 2 giờ | Chỉ số đo trong khoảng này mới được xét ngưỡng |
| A3 `disease-watch` | `radius_m`, `window_days`, `min_reports` | 2000 m, 7 ngày, 3 báo cáo | Từ 3 báo cáo cùng bệnh trong 2 km → `disease.inspection` và `notification.households` (mẫu `disease_nearby`). Chạy hằng ngày lúc 05:40 và khi tập báo cáo trong cửa sổ thay đổi |
| A4 `harvest-ready` | `harvest_window_days` | 3 ngày | Thửa đang `TENDING`, vụ có ngày thu hoạch dự kiến trong 3 ngày tới, và mọi hoạt động phun thuốc không nháp đã qua ngày an toàn → `harvest.approve`. Chạy hằng ngày lúc 05:30 để kịp chiến dịch 06:00 |
| A5 `bulletin` | `commodity`, `market_hours` | `Tea`, 48 giờ | Không có dữ liệu thị trường trong 48 giờ thì không chạy. Chạy hằng ngày lúc 05:00 |

Quy tắc mẫu tin: tin gửi nông hộ và cán bộ không bao giờ là văn bản tự do của agent. Agent chỉ gửi mã mẫu và các slot có kiểu xác định; web dựng nội dung tiếng Việt từ mẫu. Agent không được gửi `note_vi`, `body`, mã mẫu lạ hoặc slot sai kiểu: các trường này bị từ chối với mã `INVALID_PAYLOAD` (HTTP 400). Quản lý hoặc cán bộ có thể thêm `note_vi` khi duyệt; ghi chú này được nối vào cuối nội dung như một đoạn mới.

Dữ liệu thiếu không tạo đề xuất: thửa không có cảm biến, bản ghi thời tiết không có `forecast_json`, báo cáo bệnh có tên không nhận diện được hoặc là `healthy`, và không có dữ liệu thị trường trong 48 giờ đều chỉ bỏ qua, không gây lỗi.

---

### 3.11 Trợ lý Telegram (M5)

Trợ lý chỉ hoạt động trong chat riêng giữa bot và một tài khoản đã liên kết. Nhóm giữ hành vi M2 (báo cáo và nút duyệt v1).

- **Giới hạn (C9):**
  - tối đa 60 tin nhắn và lần bấm nút mỗi tài khoản Telegram trong một giờ; tin thứ 61 nhận `rateLimited` một lần, các tin sau trong giờ đó không có phản hồi;
  - câu nhắn chuyển cho trợ lý chỉ khi HTX có nhịp tim `agent:<HTX>` trong 10 phút; không có thì trả lời `notUnderstood` kèm menu;
  - văn bản giữ trong phiên hoặc yêu cầu tối đa 1000 ký tự; ảnh tối đa 5 MB;
  - mỗi tài khoản chỉ có một phiên nhập; mở menu hoặc bắt đầu phiên mới thì phiên cũ bị thay thế.
- **Hạn:**
  - phiên nhập hết hạn 30 phút sau bước cuối (`flowExpired`);
  - thẻ xác nhận hết hạn 10 phút sau khi gửi (`cardExpired`), không ghi gì;
  - hành động mức `high` (duyệt thu hoạch) có hai thẻ, thẻ thứ hai hết hạn 10 phút sau khi bấm Tiếp tục;
  - yêu cầu gửi cho trợ lý quá 60 giây chưa có trả lời thì nhận `assistantTimeout` kèm menu.
- **Ghi dữ liệu:** chỉ khi chính tài khoản đó bấm Xác nhận trên thẻ của mình. Vai trò, HTX và trạng thái bật của tài khoản được đọc lại khi xử lý tin và khi bấm Xác nhận; bị hạ quyền hay đổi HTX thì không ghi gì (`noPermission`).
- **Ảnh và vị trí:** ảnh lớn hơn 5 MB hoặc tải lỗi không được ghi; vị trí chỉ dùng để tìm thửa gần nhất (công cụ `nearby`).
- **LLM (agent A7) chỉ thấy:** câu người dùng nhắn (đã che số điện thoại, e-mail và số giấy tờ khi dùng nhà cung cấp bên ngoài), ngày hôm nay theo giờ Việt Nam, và danh sách tên công cụ và hành động. Không gửi ảnh, vị trí, kết quả công cụ hay dữ liệu trả lời.
- **Lệnh chưa có:** `/tuvanhanh`, `/dung` trả lời `notYet`. `/chiendich` gửi chiến dịch hôm nay của HTX (mục 3.12), hoặc `Hôm nay chưa có chiến dịch.`.

### 3.12 Chiến dịch ngày (A9, M7)

- **Lịch:** A9 chạy lúc 06:00 (giờ Việt Nam), sau A4 (05:30) và A3 (05:40). Báo cáo 18:00 có thêm tiến độ chiến dịch (mục 13.3 của đặc tả).
- **Giới hạn:**
  - tối đa 15 việc trong một chiến dịch, mỗi việc có một mục tiêu đo được (ví dụ `1 thửa`, `3 nhật ký`);
  - tối đa một chiến dịch cho mỗi HTX trong một ngày; lần đăng thứ hai trong ngày trả lại chiến dịch đã có và không gửi thêm tin Telegram;
  - tóm tắt do LLM viết tối đa 400 ký tự; không có nhà cung cấp hoặc LLM lỗi thì dùng câu mẫu `Hôm nay có <n> việc: …`;
  - không có việc nào thì không đăng chiến dịch và không gọi LLM.
- **Thứ tự và loại việc bị bỏ (quy tắc C5):** mỗi việc bị bỏ được ghi kèm quy tắc (`withdrawal`, `rain`, `people`, `overflow`) và vẫn là đề xuất `proposed`.
  1. `withdrawal`: không đưa việc thu hoạch vào thửa còn trong thời gian cách ly của lần phun thuốc.
  2. `rain`: không đưa việc phun thuốc vào thửa có dự báo mưa từ 5 mm trở lên trong 12 giờ tới.
  3. Sắp theo loại việc (thu hoạch, kiểm tra bệnh, thông báo nông hộ, nhật ký, thông báo cán bộ, bản tin), rồi theo ngày tạo.
     Khi kế hoạch mùa vụ đang áp dụng (mục 3.16), việc thuộc mục tiêu mà kế hoạch nâng lên (sản lượng, thửa có bệnh, nhật ký đúng hạn) được xếp trước các việc còn lại; thứ tự theo loại việc vẫn giữ trong từng nhóm.
  4. `people`: khi có số người có mặt (từ chấm công, M10), bỏ việc vượt số người cần; hiện chưa có số liệu nên bước này không bỏ việc nào.
  5. `overflow`: giữ 15 việc đầu; việc còn lại mở lại vào ngày mai.
- **Duyệt cả chiến dịch (C7):**
  - chạy mọi việc mà người duyệt được quyết định, qua cùng luồng `DecideProposalUseCase` của đề xuất;
  - việc mức `high` (duyệt thu hoạch) không bao giờ chạy từ "duyệt cả": nó chờ xác nhận riêng và chiến dịch chuyển sang `partial`;
  - việc mà vai trò của người duyệt không được quyết định được gửi lại cho cán bộ có quyền qua Telegram;
  - một việc lỗi hoặc đã được quyết định không dừng các việc còn lại; kết quả ghi số việc đã chạy, chờ xác nhận riêng, chuyển người đủ quyền và lỗi;
  - bỏ chiến dịch chỉ khi còn nháp hoặc một phần; sau khi bỏ, các việc trở lại là đề xuất thông thường.

### 3.13 Cải tiến hằng tuần (A10, M8)

- **Lịch:** A10 chạy mỗi thứ Hai lúc 06:30 (giờ Việt Nam), trước báo cáo 07:00. Nếu tuần này chưa chạy, lần khởi động đầu tiên sau đó sẽ chạy bù.
- **Luật tìm vấn đề, LLM chỉ viết lý do:** mỗi cải tiến là một đề xuất thông thường (`agent.settings.update` hoặc `improvement.adopt`). Tối đa 5 cải tiến mỗi lần chạy, theo thứ tự bảng dưới. LLM chỉ nhận luật, chỉ số, con số và thay đổi, rồi trả `rationale_vi` tối đa 600 ký tự; nếu nhà cung cấp lỗi, dùng câu mẫu `<chỉ số>: <giá trị> trong <n> ngày gần đây (ngưỡng <giới hạn>). Đề xuất: <thay đổi>.`.

| Luật | Chỉ số (`metric_key`) | Kích hoạt khi | Cải tiến |
|---|---|---|---|
| Nhiễu | `reject_rate:<agent>:<mẫu>` | Tỉ lệ từ chối ≥ 0,6 với ít nhất 5 đề xuất đã quyết định; mẫu `sensor_silent`, `dry_soil`, `heat`, `frost`, `rain_after_spray` của field-watch và `disease.inspection` của disease-watch | `agent.settings.update` nới một bậc: `silent_hours` +2 (tối đa 48), `dry_soil_pct` −3, `heat_c` +1, `frost_c` −1, `heavy_rain_mm` +5, `min_reports` +1 |
| Thiếu thông tin | `journal_missing_info_rate` | ≥ 0,4 với ít nhất 10 nhật ký đã xem | `process`: bắt buộc ghi liều lượng khi ghi nhật ký phun thuốc |
| Quyết định chậm | `median_wait_hours` | ≥ 24 giờ với ít nhất 10 đề xuất đã quyết định | `process`: giao thêm người duyệt đề xuất |
| Trượt mục tiêu | `missed_days:<goal_key>` | ≥ 3 ngày trượt trong 14 ngày | `template`: nhắc đầu tuần vào thứ Hai |
| Mục tiêu vụ chậm | `season_goal:<khóa>` | Có kế hoạch mùa vụ đang áp dụng, đã qua ít nhất 4 tuần của quý, và số thực tế chậm hơn mục tiêu theo tỉ lệ thời gian từ 20% trở lên | `process`: `Mục tiêu vụ "<nhãn>" đang chậm so với kế hoạch` |

- **Không lặp:** chỉ số đang có cải tiến `proposed`, hoặc cải tiến đã `adopted` trong 28 ngày gần đây, thì không tạo cải tiến mới.
- **Giới hạn đề xuất:** A10 không bao giờ đề xuất thay đổi danh mục, vai trò, chính sách nhà cung cấp, ngân sách, khóa hay quyền tự chủ. Chỉ các khóa dưới đây được đề xuất:

| Agent | Khóa | Khoảng giá trị | Siết (nghiêm hơn) là |
|---|---|---|---|
| `field-watch` | `silent_hours` | 1–48 | thấp hơn |
| `field-watch` | `dry_soil_pct` | 5–80 | cao hơn |
| `field-watch` | `heat_c` | 25–50 | thấp hơn |
| `field-watch` | `frost_c` | −5–15 | cao hơn |
| `field-watch` | `heavy_rain_mm` | 1–200 | thấp hơn |
| `disease-watch` | `min_reports` | 2–20 | thấp hơn |
| `disease-watch` | `radius_m` | 200–20000 | cao hơn |
| `disease-watch` | `window_days` | 1–60 | cao hơn |
| `harvest-ready` | `harvest_window_days` | 0–30 | cao hơn |
| `digest` | `schedule` (`HH:MM`) | 05:00–22:00 | không áp dụng |

- **Xem trước:** mỗi thay đổi hiện một dòng `<nhãn>: <cũ> → <mới> (siết|nới)`. Đề xuất có mức tự chủ `auto`, nhưng M12 sẽ quy định chiều nào được tự chạy (đặc tả §11.1).
- **Đề xuất đã lỗi thời:** nếu cài đặt đổi sau khi đề xuất được tạo, quyết định sẽ là `stale` và không thay đổi gì.
- **Đo lại:** cải tiến đã áp dụng được đo sau 2 và 4 tuần so với `baseline`. Giảm ít nhất 20 % là `helped` (đã giúp), tăng ít nhất 20 % là `drop` (nên bỏ), còn lại là `no_effect` (chưa thấy tác dụng). Chỉ số không có giá trị thì không đo.
- **Trạng thái theo đề xuất:** đề xuất được duyệt và chạy thì cải tiến thành `adopted`; bị từ chối thì thành `declined`. Cải tiến bị từ chối hoặc không có dữ liệu không được đo.
- **Nhắc theo mẫu:** tin 06:00 của đúng thứ trong tuần hiển thị tối đa 2 dòng `Nhắc theo mẫu: <tiêu đề>` (chiến dịch ngày, mục 3.12).

### 3.14 MCP cho client bên ngoài và dòng kiểm chứng lô (M14)

> Đóng băng (ADR 0005): chỉ chạy khi `DXOS_LABS=1`.

- **Đăng nhập:** client MCP đăng nhập bằng tài khoản Keycloak của chính người dùng, qua client `dxos-mcp` (device grant, không có direct grant). Token có đúng quyền của người dùng; vai trò, HTX và trạng thái bật/tắt được đọc trực tiếp mỗi lần gọi (như Telegram).
- **Từ chối:** token hết hạn, token của client khác hoặc người dùng bị tắt cho 401 hoặc 403 và không tạo gì. Loại đề xuất mà vai trò của người dùng không duyệt được bị từ chối với 403 `NOT_AN_APPROVER`.
- **Công cụ:** chỉ các công cụ đọc của trợ lý và đúng một công cụ ghi `create_proposal`. Loại được phép từ MCP: `notification.internal`, `notification.households`, `disease.inspection`, `journal.approve`, `journal.reject`, `harvest.approve`, `bulletin.publish`.
- **Không thực thi:** đề xuất từ MCP có `origin: 'user'`, `agent: 'mcp'` và `requested_by` là người dùng. Chỉ `DecideProposalUseCase` quyết định nó, bởi người có quyền duyệt (có thể là chính người đó). Chế độ tự chủ M12 không bao giờ tự chạy đề xuất `origin: 'user'`.
- **Bằng chứng:** web tự dựng bằng chứng từ các chủ thể trong payload; chủ thể ngoài HTX bị 400 `EVIDENCE_NOT_IN_HTX`.
- **Cầu nối:** `platform/mcp/dxos_mcp.py` chạy trên máy người dùng, nói MCP qua stdio. File token có quyền 0600, token không bao giờ in ra stdout hoặc stderr. Refresh thất bại thì trả thông báo đăng nhập lại, không làm dừng vòng lặp stdio.
- **Dòng kiểm chứng (C4):** trang truy xuất công khai chỉ hiện dòng `AI đề xuất, <cán bộ|trưởng HTX> đã duyệt ngày <dd/MM/yyyy>, kiểm chứng trong sổ audit` khi cả bốn điều kiện đúng:
  1. có đề xuất `harvest.approve` đã `executed` của thửa trong lô, trước khi lô được tạo;
  2. sự kiện quyết định của đề xuất có trong sổ audit;
  3. mã băm bằng chứng của sự kiện khớp `evidence.sha256` của đề xuất;
  4. `audit.verify_chain()` không báo dòng hỏng đến sự kiện đó.
  Không hiện dòng nào khi chuỗi audit hỏng, mã băm lệch, đề xuất bị từ chối hoặc lô không có quyết định AI. Dòng chỉ ghi vai trò, không bao giờ ghi tên; tối đa 3 dòng.

### 3.15 Giao việc nhân sự (A8, M10)

> Đóng băng (ADR 0005): chỉ chạy khi `DXOS_LABS=1`.

- **Lịch:** A8 chạy lúc 05:50 (giờ Việt Nam), sau A4 (05:30) và A3 (05:40), trước A9 (06:00). Không dùng LLM.
- **Luật:** từ các đề xuất của HTX được duyệt trong 24 giờ qua: `harvest.approve` thành "Hái chè thửa <mã>", `disease.inspection` thành "Kiểm tra bệnh quanh thửa <mã>", `notification.households` mẫu `dry_soil` thành "Tưới thửa <mã>". Hạn là hôm nay. Mỗi nguồn một việc, tối đa 10 việc mỗi lần chạy, ưu tiên thu hoạch, rồi kiểm tra, rồi tưới. Mẫu `rain_after_spray` không tạo việc.
- **Người nhận gợi ý:** nhân sự đang làm việc có ít việc nhất trong lần chạy; ưu tiên phòng `Kỹ thuật` cho việc kiểm tra. Không có nhân sự đang làm việc thì bỏ việc đó (ghi nhật ký INFO) vì app nhân sự không tạo được việc không có người nhận. Quản lý sửa được người nhận, hạn và ghi chú trước khi duyệt.
- **Sau khi duyệt:** đề xuất `staff.task.create` chuyển sang `sent_to_staff_app` ("Đã gửi app nhân sự"). App nhân sự kéo việc về mỗi phút, tạo việc rồi báo mã việc; đề xuất mới thành `executed`. Lõi không bao giờ gọi app nhân sự.
- **Kết nối:** `./dxos staff enable <HTX>` tạo client `dxos-staff-<htx>` (vai trò `staff-sync`, claim `htx_code`) và in client id, secret một lần cùng hai địa chỉ (Keycloak và cổng lõi) để nhập vào cài đặt app. Đường `/api/internal/staff/*` là đường nội bộ duy nhất mở trên cổng công khai 9080, vì app chạy trên máy ngoài mạng compose; mọi lệnh gọi chỉ thấy dữ liệu của HTX trong token, và token agent, rơle, người dùng bị từ chối.
- **Dữ liệu cá nhân:** danh sách nhân sự chỉ gồm mã, tên, phòng và trạng thái; số điện thoại và lương không rời app nhân sự. Hôm nay chưa có báo cáo chuyên cần thì A9 bỏ luật số người.

### 3.16 Mini App Telegram (M6)

- **Yêu cầu HTTPS (D17):** Telegram chỉ mở Mini App qua địa chỉ `https://`. Đặt `DXOS_WEB_PUBLIC_URL` (địa chỉ gốc HTTPS của web) cho `dxos-telegram`. Khi giá trị rỗng hoặc không bắt đầu bằng `https://`, rơle không đặt nút menu và ghi một dòng nhật ký lúc khởi động; chat, nút duyệt và web hoạt động như trước.
- **Khoá:** `./dxos telegram enable` ghi `DXOS_TELEGRAM_WEBAPP_KEY` = HMAC-SHA256(khoá `WebAppData`, token bot) cho web; `disable` xoá. Web chỉ dùng khoá này để kiểm chữ ký `initData`, không giữ token bot.
- **Ràng buộc phiên:** `initData` không phải là đăng nhập. Chữ ký phải đúng, `auth_date` không quá 24 giờ, và `user.id` phải là tài khoản Telegram đã liên kết của người đang đăng nhập; không thì web trả 403 `WEBAPP_NOT_LINKED`. Cờ phiên `dxos_tg_webapp` hết hạn sau 12 giờ.

### 3.17 Chế độ tự vận hành (M12)

> Đóng băng (ADR 0005): chỉ chạy khi `DXOS_LABS=1`.

Chế độ tắt mặc định. Khi trưởng HTX bật, đề xuất của agent thuộc các loại được phép tự chạy sau một cửa sổ chặn, dưới tên người đã bật, qua đúng `DecideProposalUseCase` như khi người duyệt. Đặc tả: §11 của [docs/specs/2026-11-23-agentic-layer-design.md](./specs/2026-11-23-agentic-layer-design.md).

**Năm giới hạn cứng (H1–H5), đúng với mọi cài đặt:**
1. Mọi lần tự chạy đi qua `DecideProposalUseCase`, nên qua cùng các kiểm tra nghiệp vụ như quyết định của người.
2. Không loại hành động nào đổi được chế độ này, giới hạn cứng, danh mục loại, vai trò, khoá, ngân sách, chính sách dữ liệu hay sổ audit.
3. Duyệt báo cáo bệnh không bao giờ tự chạy.
4. Không có loại hành động xoá nào.
5. Mỗi lần tự chạy ghi sự kiện audit và gửi một tin Telegram.

**Việc nào tự chạy.** Chỉ đề xuất `origin: 'agent'` mà loại của nó cho phép vai trò `manager` duyệt, và là loại `auto`, hoặc `unlockable` đã được mở lúc bật. Đề xuất từ chat hoặc MCP (`origin: 'user'`) không bao giờ tự chạy. `agent.settings.update` chỉ tự chạy khi mọi thay đổi đều siết; một thay đổi nới, khoá lạ hoặc tắt agent thì luôn chờ người. `journal.approve`, `harvest.approve` và hành động có `money` ở mức `never` từ GĐ0 nên không bao giờ tự chạy (xem §4.2).

**Cửa sổ chặn theo rủi ro:**

| Rủi ro | Cửa sổ |
|---|---|
| thấp | 0 (lần tick kế tiếp) |
| trung bình | 15 phút |
| cao | 2 giờ |
| việc liên quan tiền (chưa có loại nào) | 2 giờ |
| `strategy.adopt` (M11) | 48 giờ |

Trong cửa sổ, bất kỳ người duyệt nào cũng chặn được bằng nút `Chặn` trên Telegram; đề xuất bị chặn quay về chờ duyệt như thường. Chặn sau khi đã chạy trả lời `Đã chạy, không chặn được nữa.`

**Giới hạn ngày:** tối đa 50 lần tự chạy mỗi ngày (HTX đặt thấp hơn được), và tối đa 2 tin tự động tới mỗi nông hộ mỗi ngày; tin gửi nông hộ do tự chạy kết thúc bằng `(Tin do AI của HTX gửi)`.

**Bốn phanh** dừng chế độ ngay khi:
- từ 3 lần tự chạy thất bại (`failed` hoặc `stale`) trong 1 giờ (`brake_failures`);
- số lần tự chạy trong ngày đạt giới hạn ngày (`brake_cap`);
- tỉ lệ bị chặn lớn hơn 30% số việc đã quyết trong ngày, khi đã có ít nhất 5 việc (`brake_blocks`);
- số đề xuất trong ngày của một agent vượt 3 lần mức trung bình ngày của 14 ngày trước, khi mức trung bình từ 1 trở lên (`brake_volume`).

**Tự dừng:** người bật không còn là `manager` hoặc bị tắt (`enabler_lost`); 7 ngày không có quản lý nào tương tác (`inactive`).

**Dừng:** nút `Dừng ngay` trên web, lệnh `/dung` trên Telegram (quản lý hoặc cán bộ), hoặc một phanh. Mọi cửa sổ đang chờ được xoá, đề xuất ở lại `proposed` cho người duyệt, và mọi quản lý, cán bộ đã liên kết nhận tin. Bật lại chỉ làm được trên web.

**Bật:** chỉ quản lý, và phải đăng nhập lại trong 5 phút gần nhất. Màn hình bật hiện tỉ lệ khớp 30 ngày của từng loại (cảnh báo dưới 90%); nội dung màn hình được lưu trong sự kiện audit `autopilot.enabled`. Ở chế độ thường, mỗi đề xuất vẫn ghi `shadow_auto` (nó có tự chạy nếu chế độ bật hay không) mà không đổi đường đi của đề xuất.

**Giám sát:** tin `Sẽ tự chạy lúc <HH:mm>` kèm nút `Chặn` và `Xem`; `/tuvanhanh` cho trạng thái và số liệu hôm nay; tin chiến dịch 06:00 bắt đầu bằng `Chiến dịch hôm nay sẽ tự chạy`; báo cáo 18:00 có mục `Tự vận hành`.

### 3.18 Tin thoại Telegram (M15)

- **Chỉ trên máy chủ của HTX:** tin thoại được `dxos-telegram` tải về bộ nhớ và gửi tới `dxos-stt` (whisper.cpp) trong mạng Docker. Âm thanh không ghi ra đĩa ở rơle, không đi tới web, nhà cung cấp AI hay dịch vụ nào khác; chỉ phần chữ được chuyển tiếp. `DXOS_STT_URL` chỉ nhận máy `dxos-stt`, `localhost` hoặc địa chỉ riêng; địa chỉ công khai bị từ chối lúc khởi động (tin thoại báo chưa nghe được, chat chữ vẫn chạy).
- **Giới hạn:**
  - tối đa 60 giây và 2 MB mỗi tin thoại; dài hơn thì không tải về và trả lời `Tin thoại dài quá 60 giây. Bạn nói ngắn hơn hoặc nhắn chữ nhé.`;
  - chờ `dxos-stt` tối đa 30 giây, không thử lại; chữ nhận được cắt ở 500 ký tự;
  - chỉ trong chat riêng; tin thoại trong nhóm bị bỏ qua.
- **Tin thoại không tự làm gì:** bot trả lời `Em nghe được: “…”` kèm `Đúng`, `Sửa`, `Huỷ`, giữ chữ 10 phút. Chỉ `Đúng` đưa chữ đi tiếp như người dùng tự gõ; việc ghi dữ liệu vẫn cần thẻ và nút Xác nhận như mục 3.11.
- **Không có `dxos-stt`:** trả lời `Chưa nghe được tin thoại lúc này. Bạn nhắn chữ giúp nhé.`, không ảnh hưởng chức năng khác. Im lặng hoặc chỉ có tiếng ồn: `Chưa nghe rõ. Bạn nói lại hoặc nhắn chữ nhé.`.
- **Mô hình:** mặc định `small` (`DXOS_STT_MODEL`), tải một lần bằng `make up-voice` và kiểm SHA-256. Chọn mô hình nhỏ nhất nghe được giọng của HTX bằng `make stt-measure DIR=<thư mục .ogg kèm .txt>` (đo tỉ lệ sai từ và thời gian của `base`, `small`, `medium`).

### 3.18a Ảnh, bản tin đọc thành tiếng và ảnh mồ côi trong chat (issue #80)

- **Báo bệnh bằng ảnh (`disease.report`, nông dân):** chọn thửa của hộ mình, gửi một ảnh JPEG hoặc PNG tối đa 5 MB, rồi bấm Xác nhận trên thẻ `Gửi ảnh thửa <mã> để chẩn đoán`. Kết quả là nhãn đứng đầu, độ tin cậy và `Cán bộ sẽ xác nhận kết quả này.` (người xác nhận kết quả bệnh vẫn là cán bộ). Ảnh lớn hơn 5 MB hoặc không phải JPEG/PNG bị từ chối bằng câu của M5, không lưu gì.
- **Không có phiên trình duyệt:** chat gọi API chẩn đoán bằng token của client `dxos-web-service` (vai trò `web-service`, audience `dx-os-core`), không bằng token người dùng. Secret `DXOS_WEB_SERVICE_SECRET` do `./dxos telegram enable` ghi vào `roles.env` của web (`disable` xoá); web đọc biến môi trường trước, rồi tệp. Thiếu secret: `Chưa bật chẩn đoán qua Telegram.`, không lưu và không gọi gì.
- **Cổng:** route `internal-web-disease` (`/api/internal/web/disease/*`, chỉ POST) chỉ có trên cổng nội bộ 9081, chỉ nhận `azp = dxos-web-service` kèm vai trò `web-service`, tối đa 30 lần mỗi phút mỗi token. Các route của người dùng (`workflow`, `disease`, `llm-chat`, `mcp`) từ chối token này.
- **Nghe bản tin:** tin của công cụ `bulletin` có nút `Nghe`. Bấm thì web kiểm tra Piper, rồi bản tin mới nhất của HTX được đọc (tối đa 2.000 ký tự, bỏ dấu markdown) và rơle gửi tệp `ban-tin.wav` bằng `sendDocument`, chú thích `Bản tin <ngày>`. Telegram chỉ nhận ghi âm OGG/Opus, MP3 hoặc M4A và máy chưa có bộ mã hoá, nên âm thanh gửi dưới dạng tệp. Piper không chạy: `Chưa đọc được bản tin lúc này.`, không gửi gì.
- **Chú thích ảnh:** khi không có phiên nào đang chờ ảnh, chú thích của ảnh được xử lý như tin nhắn chữ; trong bước nhận ảnh thì ảnh được dùng và chú thích bị bỏ qua.
- **Ảnh mồ côi:** ảnh đã lưu trong phiên bị xoá khi thẻ bị huỷ, khi phiên bị thay (`/menu`, lệnh khác, `/huy`, `/stop`, nút menu) hoặc khi gặp phiên đã hết hạn; ảnh của hành động đã thực hiện được giữ. Hành động lỗi cũng xoá ảnh của nó.
- **Nhật ký:** `GET /api/journal` trả danh sách rỗng cho nông dân chưa có nông hộ, không còn trả mọi nhật ký mà vai trò đọc được.

### 3.18b Tra cứu và thao tác còn lại trong chat (issue #80)

Mọi dòng của hai nhóm "trong chat" ở bảng phủ (`apps/web/src/application/telegram/coverage.ts`) đều có một công cụ hoặc một hành động phục vụ. Kiểm thử 17 kiểm điều này, không có danh sách ngoại lệ.

**Quy tắc chung:**
- **Vai trò theo đúng route của web.** Vai trò mà route từ chối thì nhận `noPermission`, và quyền được đọc lại lúc bấm Xác nhận.
- **Không lộ dữ liệu của nơi khác.** Mã thửa, lô, nông hộ hay thành viên của HTX khác, và của hộ khác đối với nông dân, được trả lời như không tồn tại (`Không tìm thấy …`).
- **Giới hạn:** mỗi câu trả lời tra cứu tối đa 7 dòng; mỗi bước chọn tối đa 8 lựa chọn, mới nhất trước; thẻ xác nhận tối đa 5 dòng. Ngày gõ theo dạng `dd/mm/yyyy`.
- **Tài liệu** chỉ hiện tên và ngày. Chat không bao giờ gửi tệp hay đường dẫn có chữ ký.
- **Dữ liệu cá nhân.** Câu trả lời trong chat riêng có thể chứa tên và số điện thoại của nông hộ, thành viên, đúng với những gì vai trò đó đọc được trên web (đặc tả §8.3). Báo cáo tự động vẫn không chứa dữ liệu cá nhân (mục 3.11, đặc tả §13.3).
- **Mời thành viên không làm trong chat.** Việc mời tạo một tài khoản kèm mật khẩu, nên chỉ làm trong ứng dụng (Mini App hoặc web, mục Thành viên). Không tin nhắn Telegram nào mang mật khẩu. Nhắn `mời thành viên` thì bot trả danh sách thành viên kèm dòng chỉ chỗ mời.

**Tra cứu (chỉ đọc):**

| Câu nhắn | Công cụ | Vai trò | Trả lời |
|---|---|---|---|
| `tìm <từ>` (đầu câu) | `search` | mọi vai trò | kết quả theo loại, kèm mã hoặc tên; nông dân chỉ thấy của hộ mình |
| `chứng nhận <mã lô>` | `certificate` | mọi vai trò | lô, sản phẩm, ngày thu hoạch, trạng thái; liên kết truy xuất khi lô đã xuất QR và web có HTTPS |
| `đất thửa <mã>` | `soil` | mọi vai trò (nông dân: thửa của hộ) | số đo mới nhất và nhãn sức khoẻ đất |
| `ảnh thửa <mã>` | `photo` | mọi vai trò (nông dân: thửa của hộ) | ngày và nguồn của ảnh mới nhất; không gửi ảnh hay đường dẫn có chữ ký |
| `nông hộ`, `hộ <tên>` (đầu câu) | `households` | cán bộ, quản lý | danh sách nông hộ, hoặc một hộ kèm các thửa |
| `thành viên`, `mời thành viên` | `members` | quản lý | số thành viên theo trạng thái, những người đang chờ duyệt, và dòng `Mời thành viên mới: mở ứng dụng, mục Thành viên.` |
| `báo cáo bệnh` | `diseases` | cán bộ | các báo cáo bệnh đang chờ người xác nhận |
| `hồ sơ` | `profile` | mọi vai trò | hồ sơ của chính người hỏi, hộ của họ và hồ sơ HTX |
| `tài liệu` | `documents` | cán bộ, quản lý | tên và ngày của tài liệu |
| `đối tác` | `partners` | mọi vai trò | danh sách đối tác |
| `lô hàng <mã lô>` | `lots` | cán bộ, quản lý | chi tiết một lô: trạng thái, sản phẩm, ngày thu hoạch, khối lượng, số thửa, người mua |
| `lịch thu hoạch` | `harvest_schedule` | quản lý | thêm dòng đầu `Chưa đặt ngày: <n> lứa · <thửa>` khi có lứa chưa có ngày thu hoạch |

**Thao tác (thẻ xác nhận; mức `high` có hai thẻ):**

| Câu nhắn | Hành động | Vai trò | Mức |
|---|---|---|---|
| `sửa nhật ký` | `journal.edit` (ghi chú hoặc ngày) | nông dân | `medium` |
| `rút nhật ký`, `xoá nhật ký` | `journal.delete` (nháp hoặc chờ duyệt) | nông dân | `high` |
| `duyệt báo cáo bệnh`, `duyệt bệnh` | `disease.review` | cán bộ | `medium` |
| `bắt đầu lứa mới`, `lứa mới` | `round.start` | cán bộ | `medium` |
| `đặt ngày thu hoạch`, `đổi ngày thu hoạch` | `harvest.schedule` | quản lý | `medium` |
| `tạo lô hàng`, `tạo lô` | `lot.create` (một thửa, khối lượng kg) | cán bộ | `medium` |
| `xuất mã QR`, `xuất QR` | `lot.export_qr` | cán bộ, quản lý | `high` |
| `gửi thông báo` | `notification.announce` (một hộ hoặc cả HTX) | quản lý | `high` |
| `đánh dấu đã đọc` | `notification.read` | mọi vai trò | `medium` |
| `xoá thông báo` | `notification.clear` (50 thông báo mới nhất của chính mình) | mọi vai trò | `high` |
| `duyệt thành viên` | `member.approve` | quản lý | `high` |
| `xoá thành viên` | `member.remove` | quản lý | `high` |
| `sửa hồ sơ` | `profile.edit` (hồ sơ HTX) | quản lý | `medium` |
| `thêm nông hộ` | `household.add` | cán bộ | `medium` |
| `sửa nông hộ` | `household.edit` | nông dân (hộ mình), cán bộ, quản lý | `medium` |
| `xoá thửa` | `parcel.delete` | cán bộ, quản lý | `high` |

### 3.19 Hành động của mini-app (M9)

| Quy tắc | Giá trị |
|---|---|
| Số hành động tối đa mỗi app | 10 (`agent.actions` trong `app.yaml`) |
| Số gợi ý tối đa mỗi lần hỏi một app | 10 |
| Chu kỳ agent hỏi gợi ý của app | 30 phút, mỗi HTX và mỗi app đã bật |
| Không lặp đề xuất của app | 24 giờ, theo loại `app.<id>.<action>` và đối tượng |
| Hạn của đề xuất app | 72 giờ |
| Cửa sổ chặn khi tự vận hành | hành động `money: true` là loại phải mở khoá riêng, cửa sổ 2 giờ; hành động khác `risk` trung bình 15 phút |
| Quyền duyệt | vai trò trong `approver_roles` của hành động (`officer`, `manager`) |
| Thứ tự trong chiến dịch ngày (A9) | sau bản tin, trước các loại chưa biết |
| Tên hành động | `^[a-z][a-z0-9_.]{2,40}$` |
| `payload` | chỉ các từ khoá `type`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`, `required`, `additionalProperties: false`; tối đa 20 thuộc tính |

- Hành động của app chỉ chạy sau một quyết định, như mọi loại đề xuất khác; không đường nào bỏ qua quyết định ngoài chế độ tự vận hành (mục 3.15).
- Web chạy hành động bằng token của client `dxos-apps-actor` (không có vai trò nào) kèm ba header `X-DXOS-Acting-*` về người duyệt. Gateway xoá ba header này ở mọi route app, trừ route hành động chỉ nhận client đó; app chỉ tin header khi `azp` của token là `dxos-apps-actor`.
- Lỗi 4xx của app ghi `failed` kèm câu tiếng Việt của app và không tự thử lại. Gỡ app, hoặc tắt app cho HTX, làm các đề xuất đang mở của app chuyển `expired`.
- App do AI sinh ra (`generated: true`) không được khai hành động; `./dxos validate` từ chối.

### 3.20 Kế hoạch mùa vụ (A11, M11)

> Đóng băng (ADR 0005): chỉ chạy khi `DXOS_LABS=1`.

- **Lịch:** A11 soạn kế hoạch quý vào ngày đầu quý lúc 06:15 (giờ Việt Nam), và ở lần chạy đầu tiên khi quý hiện tại chưa có kế hoạch đang áp dụng hay bản nháp. Một quý đã soạn, đã có kế hoạch hoặc bị web từ chối thì không chạy lại; lỗi mạng được thử lại ở chu kỳ sau.
- **Luật đặt mục tiêu, LLM chỉ viết lời:** web tính số liệu (sản lượng, nhật ký đúng hạn, thửa có bệnh, doanh thu cửa hàng khi đã cài `tea-shop`) cho quý này, cùng kỳ năm trước và quý trước. Mục tiêu là số cùng kỳ năm trước cộng bước cố định:
  - mục tiêu tăng: làm tròn (số × 1,05);
  - mục tiêu giảm: làm tròn một chữ số thập phân (số × 0,9);
  - mục tiêu không có số cùng kỳ năm trước thì bỏ, không bao giờ tự bịa.
- **Ưu tiên và sáng kiến:** LLM chỉ nhận số liệu và mục tiêu, trả tối đa 5 ưu tiên (mỗi cái tối đa 160 ký tự) và tối đa 5 sáng kiến thuộc loại `miniapp`, `training`, `partner`, `expand`, `outside`; loại khác bị bỏ. Khi LLM lỗi, mỗi mục tiêu có một ưu tiên (`Tăng <nhãn>` hoặc `Giảm <nhãn>`) và không có sáng kiến. Việc ngoài hệ thống (vay vốn, hợp đồng, quyết định của đại hội xã viên) chỉ là sáng kiến loại `outside` dạng chữ; không có gì chạy chúng.
- **Một bản nháp mỗi quý:** bản nháp thứ hai cho cùng quý trả `existing`. Duyệt kế hoạch (`strategy.adopt`, mức `medium`, người duyệt `manager`, tự chủ `unlockable`) thay kế hoạch đã áp dụng trước đó của quý bằng kế hoạch mới.
- **Cảnh báo:** kế hoạch có mục tiêu kém hơn cùng kỳ năm trước (ví dụ do người duyệt sửa tay) mang cảnh báo `Mục tiêu <nhãn> thấp hơn cùng kỳ năm trước` và không bao giờ đủ điều kiện tự chạy (kiểm thử 37).
- **Áp dụng:** từ chu kỳ sau khi duyệt, chiến dịch ngày (A9) xếp việc thuộc mục tiêu của kế hoạch trước (mục 3.12) và cải tiến hằng tuần (A10) báo mục tiêu đang chậm (mục 3.13). Báo cáo thứ Hai so số thực tế với cùng kỳ năm trước, không so với mục tiêu do A11 đặt.

### 3.21 Xưởng mini-app (A12, M13)

> Đóng băng (ADR 0005): chỉ chạy khi `DXOS_LABS=1`.

- **Một yêu cầu đang xây cho mỗi HTX** (trạng thái `new`, `asking`, `spec_proposed`, `spec_approved`, `building`). Tối đa 5 câu hỏi (mỗi câu tối đa 160 ký tự); mô tả yêu cầu 5 đến 500 ký tự.
- **Chọn cách rẻ nhất:** bật app có sẵn trong kho, rồi mẫu Sổ tự tạo, rồi mới viết mã. Chỉ cấu hình Ollama thì chỉ có hai cách đầu.
- **Buồng xây (`build`):** chỉ có khoá, địa chỉ và mô hình của công cụ viết mã, `HTTPS_PROXY` và thư mục `/work`; không có Docker socket, biến của lõi, mạng của lõi hay `postgres`. Ra ngoài chỉ qua proxy theo danh sách host cho phép; host khác nhận 403. Tối đa 30 phút và 60 lượt mỗi vòng, 3 vòng.
- **Bảy cổng, không bỏ qua được:** `manifest`, `markup`, `kit`, `tests`, `deps`, `files`, `run` (cộng cổng `review` của AI thứ hai). Mã cổng chạy từ image, không từ thư mục của app. Một phát hiện `high` của `review` là trượt.
- **App xây xong** chỉ vào kho cho HTX yêu cầu (`owner_htx`), chạy trên mạng riêng `dxos-gen-<id>` chỉ thấy `apisix` và `postgres`, và không được khai `agent.actions` (chỉ số liệu chỉ đọc). Cài và gỡ là `miniapp.install` và `miniapp.remove`, mức `high`, qua đường `platform.app_requests` và `./dxos worker`.
- **Ảnh chụp:** bốn ảnh (desktop và điện thoại, sáng và tối) gửi một lần qua Telegram dưới dạng album; chú thích tối đa 1024 ký tự, mỗi ảnh tối đa 5 MB; album không có nút, nút duyệt nằm ở tin đề xuất `miniapp.install` gửi sau.

### 3.22 Bàn cân và giá lá tươi hằng ngày (GĐ1 S3)

Bàn cân ghi phiếu cân búp tươi (`fresh_leaf_tickets`) theo phẩm cấp và giá của ngày. Phiếu không sửa được: sai thì huỷ và cân lại.

- **Phẩm cấp (`leaf_grades`).** Mỗi HTX tự đặt danh sách phẩm cấp (tên tối đa 60 ký tự, không trùng trong HTX, `sort_order` 0 đến 1000). Chỉ `manager` thêm, đổi tên hoặc ẩn (`active = false`). Phẩm cấp ẩn không cân được. Mọi vai của HTX đọc được danh sách.
- **Giá hằng ngày (`daily_leaf_prices`).** Mỗi phẩm cấp có một giá cho mỗi ngày lịch giờ Việt Nam, số nguyên đồng/kg từ 1 đến 10.000.000. Chỉ `manager` công bố, bằng `PUT /api/leaf-prices/today`; công bố lại trong ngày thì ghi đè các dòng. Phẩm cấp phải đang dùng và thuộc HTX, nếu không cả yêu cầu bị từ chối và không ghi gì. Giá hôm qua chỉ để so sánh. Phiếu chép giá lúc ghi, nên đổi giá sau đó không đổi phiếu cũ.
- **`NO_PRICE_TODAY`.** Phẩm cấp chưa có giá của ngày cân thì trả 409 `NO_PRICE_TODAY`, không tạo phiếu.
- **Số phiếu.** `{HTX}-PC-YYYYMMDD-NNN`, ví dụ `TC-PC-20261128-001`. `YYYYMMDD` là ngày giờ Việt Nam của `weighed_at`; `NNN` đánh từ 001 theo từng HTX và từng ngày, lấy số kế tiếp dưới khoá tư vấn (advisory lock) của HTX và ngày; số phiếu duy nhất toàn bảng.
- **Đầu vào.** `household_id`, `parcel_id`, `grade_id`, `gross_kg`, `deduction_pct`, `client_id` (tuỳ chọn, UUID). `gross_kg` lớn hơn 0 và tối đa 5000; `deduction_pct` từ 0 đến 30; cả hai tối đa một chữ số thập phân. `deduction_pct` là một ô trừ chung (mưa, tạp chất, nước); không có ô riêng cho từng lý do. Thân request không nhận khoá lạ (400 `VALIDATION_ERROR`): không có trường ngày, giờ hay cờ bỏ qua cách ly. `weighed_at` là giờ máy chủ.
- **Cách tính (`computeTicket`).** Tính bằng số nguyên theo phần mười, không dùng số thực. `net_kg = gross_kg × (1 − deduction_pct / 100)`, làm tròn đến 0,1 kg, nửa làm tròn lên. `amount_vnd = net_kg × price_vnd_per_kg`, làm tròn đến đồng, nửa làm tròn lên. `amount_vnd` là số nguyên 64 bit (BigInt), API trả dưới dạng chuỗi thập phân. Cơ sở dữ liệu còn có ràng buộc `CHECK` cho giá, % trừ và kg cân.
- **Khoá cách ly tuyệt đối.** Trước khi ghi, giao dịch khoá dòng nương (`SELECT ... FOR UPDATE`) rồi áp quy tắc (a) mục 3.2 với D là ngày cân: lần phun của nương có `entry_date` không sau cuối ngày D và `safe_harvest_date` sau cuối ngày D thì chặn, bất kể lứa, vai người phun hay trạng thái nương; `DRAFT` và `REJECTED` không tính; lần phun ghi cho ngày sau D không chặn hôm nay. Bị chặn thì trả 409 `PARCEL_IN_WITHDRAWAL` kèm `safe_from` (`YYYY-MM-DD`), không tạo phiếu. Không có trường nào bỏ qua được khoá này, kể cả với `manager`. Việc tạo hoặc sửa nhật ký phun cũng khoá cùng dòng nương, nên một lần phun và một phiếu cân của cùng nương không đi lọt nhau.
- **Nương hợp lệ.** Nương phải thuộc hộ và HTX của người cân (nếu không 404 `NOT_FOUND`). Nương `DRAFT` chưa cân được (422 `DOMAIN_ERROR`).
- **Lứa của phiếu (`cycle_id`).** Lứa đang mở của nương; nếu không có thì lứa vừa đóng gần nhất; nương chưa từng có lứa thì để rỗng. Cân không tự tạo lứa.
- **`client_id` và gửi lại.** Khoá duy nhất `(created_by_id, client_id)`. Gửi lại cùng `client_id` trả 200 với phiếu đầu tiên và không tạo thêm; phiếu mới trả 201. Hai lần gửi đua nhau cũng chỉ ra một phiếu.
- **Huỷ phiếu.** `accountant` hoặc `manager` huỷ bằng `POST /api/leaf-tickets/[id]/void` kèm `reason` (3 đến 200 ký tự). Chỉ huỷ được phiếu `VALID` chưa vào kỳ quyết toán (`settlement_id` rỗng). Phiếu đã vào kỳ quyết toán trả 409 `TICKET_SETTLED`; phiếu đã huỷ trả 409 `TICKET_VOIDED`. Phiếu huỷ giữ nguyên dòng (trạng thái `VOIDED`, người huỷ, lý do, giờ huỷ) và không tính vào tổng kg, tổng tiền và đối chiếu thu hoạch.
- **Vai.** `accountant` và `manager` tạo phiếu; `officer` chỉ xem. Nông dân chỉ xem phiếu của chính hộ mình (`GET /api/leaf-tickets/mine`); phiếu của hộ khác trả 404.
- **Đèn cách ly.** `GET /api/parcels/[id]/withdrawal-status` cho màn hình cân biết nương có bị chặn không; kết quả này chỉ để hiện đèn, phiếu vẫn được kiểm lại trong giao dịch tạo.
- **Xuất CSV.** Tối đa 366 ngày và 20.000 dòng mỗi lần; cột gồm số phiếu, giờ cân (giờ Việt Nam), hộ, nương, phẩm cấp, kg cân, % trừ, kg tịnh, giá, thành tiền, trạng thái, lý do huỷ. Ô bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc xuống dòng được thêm dấu nháy đơn đầu ô để bảng tính không chạy nó như công thức.
- **Mini-app `leaf-purchase`.** Việc thu mua búp tươi nay thuộc lõi: app này ẩn khỏi Kho ứng dụng và thanh điều hướng khi `DXOS_LABS` tắt.

### 3.23 Sổ cái xã viên, vật tư ứng và quyết toán kỳ (GĐ1 S4)

Tiền luôn là số nguyên đồng (VND). `amount_vnd` là BigInt trong cơ sở dữ liệu và là chuỗi số nguyên thập phân trong API; tiền được cộng và so sánh bằng số nguyên.

- **Vật tư và phiếu ứng.** Mỗi HTX có danh mục vật tư (`input_items`: tên tối đa 80 ký tự và không trùng trong HTX, đơn vị tối đa 20, đơn giá 0 đến 100.000.000 đ, loại `FERTILIZER`, `PESTICIDE` hoặc `OTHER`). `manager` và `accountant` thêm hoặc sửa; vật tư loại `PESTICIDE` có thể gắn một thuốc của danh mục S1, loại khác thì không. Phiếu ứng (`input_advances`) do `accountant` hoặc `manager` ghi: số lượng lớn hơn 0, tối đa 100.000 và tối đa hai chữ số thập phân; ngày ứng mặc định hôm nay và không ở tương lai; vật tư phải còn dùng và có đơn giá lớn hơn 0. **Thành tiền = số lượng × đơn giá, làm tròn đến đồng, nửa làm tròn lên**, tính bằng số nguyên theo phần trăm. Đơn giá được chép lúc ghi nên đổi giá sau đó không đổi phiếu cũ. Số phiếu `{HTX}-VT-YYYYMMDD-NNN`, đánh từ 001 theo từng HTX và từng ngày dưới khoá tư vấn. Gửi lại cùng `client_id` (UUID) trả 200 với phiếu đầu tiên, không ghi thêm. Phiếu ứng không sửa: sai thì huỷ và ghi lại.
- **Huỷ phiếu ứng** chỉ khi phiếu `VALID` và chưa vào quyết toán (`settlement_id` rỗng): đã vào quyết toán trả 409 `ADVANCE_SETTLED`, đã huỷ trả 409 `ADVANCE_VOIDED`. Phiếu cân cũng chỉ huỷ được khi chưa vào quyết toán (mục 3.22).
- **Quy ước dấu của sổ.** `member_ledger_entries.amount_vnd` dương nghĩa là HTX nợ hộ, âm nghĩa là hộ nợ HTX. Số dư sổ của một hộ là tổng mọi dòng sổ của hộ.
- **Sổ chỉ thêm, không sửa.** Trigger cơ sở dữ liệu từ chối mọi `UPDATE`, `DELETE` và `TRUNCATE` trên `member_ledger_entries`. Sửa sai bằng một dòng `ADJUSTMENT` mới. Bốn loại dòng: `LEAF_CREDIT` (tiền búp, dương), `INPUT_DEBIT` (vật tư, âm), `PAYOUT` (chi trả, âm), `ADJUSTMENT` (điều chỉnh, khác 0). Không có loại dòng riêng để mang nợ sang kỳ sau.
- **Sổ chỉ được ghi khi chốt kỳ, khi chi trả và khi điều chỉnh.** Ghi phiếu cân hay phiếu ứng không ghi sổ. Số dư `balance_vnd` mà các route đọc sổ trả là số tạm tính: số dư sổ cộng tiền các phiếu cân chưa quyết toán trừ tiền các phiếu ứng chưa quyết toán.
- **Công thức chốt, cho mỗi hộ có phiếu cân hoặc phiếu ứng chưa quyết toán.** `L` là tiền búp, `A` là tiền vật tư ứng, `outstanding` là số dư sổ của hộ trừ tổng `payable_vnd` của các dòng quyết toán cũ chưa trả (âm là nợ). Khi đó `net = L − A + outstanding`; `payable_vnd = max(0, net)`; `debt_out_vnd = max(0, −net)`; `debt_in_vnd = max(0, −outstanding)` (chỉ để hiện trên phiếu). Sổ nhận đúng hai dòng: `LEAF_CREDIT +L` nếu `L > 0` và `INPUT_DEBIT −A` nếu `A > 0`; nợ cũ đã nằm sẵn trong số dư nên không ghi lại. **Bất biến:** sau khi chốt, số dư sổ của hộ trừ tổng `payable_vnd` của mọi dòng chưa trả bằng `−debt_out_vnd` của dòng vừa chốt. Hộ không có phát sinh trong kỳ không có dòng quyết toán; nợ của hộ vẫn nằm trong sổ và được trừ ở kỳ đầu tiên hộ có phát sinh.
- **Kỳ quyết toán (`settlement_periods`).** Mã `{HTX}-QT-YYYYMMDD` theo `date_to`. `accountant` hoặc `manager` tạo kỳ `DRAFT`: `date_to` không sau hôm nay (422 `DOMAIN_ERROR`); chỉ một kỳ `DRAFT` mỗi HTX (422); kỳ mới phải bắt đầu đúng ngày sau `date_to` của kỳ gần nhất, nên các kỳ liền nhau, không chồng và không hở (422 với câu nêu ngày bắt đầu đúng); kỳ đầu tiên không được bắt đầu sau ngày của phiếu cân hoặc phiếu ứng chưa quyết toán sớm nhất (422 "Còn phiếu trước ngày bắt đầu kỳ."). Kỳ `DRAFT` hiện số tạm tính từng hộ.
- **Chốt kỳ chỉ do `manager`** (`POST /api/settlements/[id]/close`), từ giao diện hoặc API; không agent hay lịch nào chốt. Chốt chạy trong một giao dịch cho cả HTX: gom **mọi phiếu cân `VALID` và phiếu ứng `VALID` chưa quyết toán đến hết `date_to`**, kể cả phiếu trước `date_from`, ghi mỗi hộ một dòng `member_settlements`, gắn `settlement_id` vào phiếu, ghi sổ, rồi đặt kỳ `CLOSED` cùng người và giờ chốt. Người tạo và người chốt đều được ghi tên; cùng một người giữ cả hai vai vẫn chuẩn bị rồi chốt được. Chốt lần hai trả 409 `PERIOD_CLOSED` và không ghi gì.
- **Xác nhận lại khi số đổi (`PERIOD_CHANGED`).** Yêu cầu chốt kèm `expected_household_count` và `expected_payable_total_vnd` mà hộp xác nhận đã hiện. Nếu số tính lại khác thì trả 409 `PERIOD_CHANGED` kèm `totals` mới, không ghi gì, và giao diện hiện lại hộp xác nhận. Cùng mã trả khi phiếu đổi giữa lúc khoá và lúc gắn.
- **Chi trả.** `accountant` hoặc `manager` ghi `POST /api/settlements/[id]/lines/[lineId]/payout` với `method` `TRANSFER` hoặc `CASH` và `ref` tuỳ chọn (tối đa 60 ký tự). Chỉ dòng có `payable_vnd > 0` (nếu không 409 `NOTHING_TO_PAY`) và chỉ một lần (lần hai 409 `ALREADY_PAID`; hai người ghi cùng lúc thì một người thành công). Ghi một dòng `PAYOUT −payable_vnd`. Hộ chưa khai tài khoản vẫn ghi `TRANSFER` được; khi đó phiếu không có QR.
- **Điều chỉnh.** Chỉ `manager`: `amount_vnd` là số nguyên khác 0 (âm hoặc dương, tối đa 15 chữ số), `reason` 5 đến 200 ký tự; ghi một dòng `ADJUSTMENT` vào sổ của hộ trong HTX.
- **Một khoá cho mỗi HTX.** Chốt kỳ, chi trả và điều chỉnh cùng lấy khoá tư vấn `settlement:{htx_code}`, nên mỗi lúc chỉ một thao tác đổi tiền của HTX chạy; chúng không chen vào giữa một lần chốt. Giao dịch đặt `dxos.actor`, nên dòng kiểm toán mang tên người thao tác.
- **Thông tin ngân hàng của hộ.** `households.bank_bin` (6 chữ số, thuộc danh sách 21 ngân hàng của `GET /api/banks`), `bank_account` (6 đến 19 chữ số), `bank_account_name` (tối đa 60 ký tự); cơ sở dữ liệu có `CHECK` cho hai cột đầu. `manager` và `accountant` đặt và đọc đủ số tài khoản (`GET`, `PUT /api/households/[id]/bank`; `PUT` chỉ trả số đã che); số đủ cũng hiện trên phiếu của họ để chuyển tiền. Xã viên chỉ đọc phiếu của chính hộ mình (hộ khác trả 404) và thấy số đã che, chỉ còn 4 số cuối; mã QR trên phiếu của xã viên vẫn mã hoá đúng tài khoản của họ, nhưng phản hồi không có số đủ ở dạng chữ. Số tài khoản không bao giờ gửi qua Telegram hay cho agent, không vào log ứng dụng, và các route ngân hàng và sổ nằm trong danh sách "tiền và ngân hàng không đi qua chat" của `coverage.ts`. Ba cột nằm trong bảng `households` nên theo trigger kiểm toán hiện có vào `audit.events` (như họ tên và số điện thoại; đây là kho nội bộ có kiểm soát). Hasura: các vai `farmer`, `manager` và `officer` chỉ được chọn `id`, `name`, `phone`, `address`, `keycloak_user_id`, `htx_profile_id`, `created_at`, `updated_at`; ba cột ngân hàng không nằm trong danh sách đó, và vai `agent` chỉ thấy `id`, `htx_profile_id`, `created_at`, `updated_at`.
- **Phiếu quyết toán và VietQR.** Phiếu gồm HTX, hộ, kỳ, các phiếu cân và phiếu ứng của dòng, dòng quyết toán và nội dung chuyển khoản `QT {ngày của mã kỳ} {4 ký tự cuối id hộ}` (ASCII, tối đa 25 ký tự). Mã QR theo chuẩn VietQR/EMVCo (CRC16/CCITT-FALSE) chỉ có khi hộ có ngân hàng và tài khoản và `payable_vnd > 0`; ảnh sinh ở máy chủ, trả dạng data URL.
- **Ai đọc gì.** Đọc danh sách và chi tiết kỳ: `manager`, `accountant`. Đọc sổ và phiếu của một hộ: `manager`, `accountant`. Xã viên chỉ đọc sổ của các hộ gắn với tài khoản mình (`GET /api/ledger/mine`, gộp theo hộ) và phiếu của chính hộ mình.

### 3.24 Mẻ sao sấy, tồn chè khô và lô từ mẻ (GĐ2)

Quy trình: phiếu cân búp tươi vào một mẻ sao, mẻ cho ra chè khô theo hạng, lô đóng gói lấy từ tồn chè khô của các mẻ đã hoàn thành. `officer` và `manager` làm mọi bước này; `accountant` và `farmer` không vào xưởng.

- **Mẻ.** Mã `{HTX}-MS-YYYYMMDD-NN` theo ngày chế biến (`processed_on`, không sau hôm nay, nếu không 422 `DOMAIN_ERROR`), `NN` đánh từ 01 theo từng HTX và từng ngày dưới khoá tư vấn. Trạng thái `OPEN`, `FINISHED`, `CANCELLED`. Tên thợ sao (`master_name`, tối đa 80), ca (40) và ghi chú (500) là tuỳ chọn.
- **Phiếu vào một mẻ, nguyên phiếu.** Một phiếu cân không chia; mỗi phiếu thuộc tối đa một mẻ (`fresh_leaf_tickets.processing_batch_id`). Chỉ phiếu `VALID` của HTX và chưa vào mẻ nào thêm được. Số phiếu cập nhật khác số phiếu gửi lên (phiếu vừa huỷ, vừa vào mẻ khác, hoặc không thuộc HTX) thì cả lần thêm bị huỷ, trả 409 `TICKETS_CHANGED`. Danh sách phiếu chọn được mặc định 30 ngày Việt Nam gần nhất, tối đa 500 phiếu; máy chủ không cấm phiếu cũ hơn.
- **Huỷ phiếu cân đã vào mẻ bị từ chối** (409 `TICKET_IN_BATCH`, nêu mã mẻ); phải bỏ phiếu khỏi mẻ đang mở trước. Phiếu trong mẻ vẫn được quyết toán bình thường (mục 3.23): tiền xã viên và khối lượng xưởng là hai việc độc lập.
- **Sản lượng chè khô.** Bộ năm hạng cố định (`DryTeaGrade`): `DINH` (Đinh), `TOM_NON` (Tôm nõn), `MOC_CAU` (Móc câu), `BOM` (Bồm), `CAM` (Cám). Mỗi hạng tối đa một dòng, kg lớn hơn 0, tối đa 100.000, một chữ số thập phân. `PUT` thay cả bộ dòng.
- **Chỉ sửa khi mẻ còn `OPEN`.** Thêm hoặc bỏ phiếu, đặt sản lượng, hoàn thành và huỷ đều khoá dòng mẻ rồi kiểm; mẻ đã hoàn thành hoặc đã huỷ trả 409 `BATCH_NOT_OPEN`.
- **Hoàn thành mẻ.** Cần ít nhất một phiếu và một dòng sản lượng (nếu không 422 `BATCH_EMPTY`). `fresh_kg` là tổng `net_kg` các phiếu, `dry_kg` là tổng sản lượng, tính bằng số nguyên theo phần mười kg. **Tỷ lệ thu hồi `recovery_ratio` = `fresh_kg / dry_kg`, làm tròn 2 chữ số thập phân, nửa làm tròn lên.** Khoảng chuẩn **4,50 đến 5,00 (kg tươi cho 1 kg khô), gồm cả hai đầu, xét trên tỷ lệ đã làm tròn** (hằng `RECOVERY_BAND`, chưa cấu hình theo HTX). Ngoài khoảng thì `out_of_band` là `true` và bắt buộc có `deviation_note`: sau khi cắt khoảng trắng phải đủ 10 ký tự, nếu không trả 422 `DEVIATION_NOTE_REQUIRED` kèm `recovery_ratio`. Ghi chú lệch ngắn hơn 10 ký tự, hoặc dài quá 500, bị zod từ chối ngay bằng 400 `VALIDATION_ERROR`. Trong khoảng chuẩn thì không lưu ghi chú.
- **Mẻ đã hoàn thành là cuối cùng.** Không mở lại và không sửa phiếu hay sản lượng; mẻ giữ đúng các số đã chốt (`fresh_kg`, `dry_kg`, `recovery_ratio`, `out_of_band`, `deviation_note`). Sai thì chỉ huỷ được khi còn `OPEN`.
- **Huỷ mẻ** chỉ khi `OPEN`, kèm lý do 3 đến 200 ký tự. Mọi phiếu của mẻ được trả lại (`processing_batch_id` rỗng). Mẻ `CANCELLED` cũng là cuối cùng.
- **Tồn chè khô.** Tồn của một dòng sản lượng = `kg` của dòng trừ tổng `lot_batch_sources.kg` đã lấy từ dòng đó. Chỉ dòng của mẻ `FINISHED` mới là tồn; hiện dòng còn tồn lớn hơn 0, mẻ cũ nhất trước (`GET /api/dry-stock`).
- **Đóng lô từ mẻ** (`POST /api/lots/from-batches`). Một lô chỉ lấy từ tồn của **một hạng**. Trong một giao dịch, khoá các dòng sản lượng được chọn, rồi: dòng không thuộc HTX, mẻ chưa `FINISHED`, hoặc số kg lấy lớn hơn tồn còn lại thì trả 409 `STOCK_CHANGED` kèm tồn mới (`error.stock`); dòng khác hạng với lô thì 422 `GRADE_MISMATCH`.
- **Kiểm cách ly từng phiếu nguồn.** Mọi phiếu cân `VALID` của các mẻ nguồn đều được kiểm, mỗi phiếu theo quy tắc (b) mục 3.2 với **ngày cân của chính phiếu là ngày thu hoạch `H`** (cuối ngày Việt Nam của ngày cân) và lứa của phiếu. Một lần phun có ngày an toàn đúng bằng ngày cân thì không chặn; một lần phun ghi sau với `entry_date` trước ngày cân thì chặn. Phiếu bị chặn thì 422 `WITHDRAWAL_NOT_PASSED` kèm `parcel_code`, `weighed_on` và `safe_on`, và không tạo lô.
- **Lô tạo ra.** `commodity` là "Chè"; `dry_grade` là hạng và `quality_grade` là nhãn tiếng Việt của hạng; `harvest_date` là ngày cân muộn nhất của các phiếu nguồn; `packaging_date` là hôm nay; `total_weight_kg` và `estimated_weight_kg` là tổng kg lấy; trạng thái `READY`. Mỗi thửa có phiếu nguồn có một dòng `lot_parcels`, với lứa của phiếu cân muộn nhất của thửa đó. Nguồn ghi ở `lot_batch_sources` (mỗi cặp lô và dòng sản lượng một dòng).
- **Mã lô** `{HTX}-CHE-YYYYMMDD-NNN` theo ngày thu hoạch của lô; `NNN` đánh dưới khoá tư vấn theo tiền tố mã (`lot:{tiền tố}`), nên hai lô không bao giờ trùng số, kể cả đường tạo lô cũ.
- **Đường tạo lô từ thửa bị đóng băng.** `POST /api/lots` (với `parcel_ids`) và thao tác chat `lot-create` chỉ chạy khi `DXOS_LABS` là `1` hoặc `true` (ADR 0005); tắt thì `POST /api/lots` trả 404 `NOT_FOUND` ("Tính năng này chưa mở."). Xuất QR một lô không có nguồn mẻ khi `DXOS_LABS` tắt thì trả 422 `LOT_WITHOUT_BATCH`. Lô đã xuất QR trước đó vẫn hiện bình thường. Với lô từ mẻ, xuất QR không còn kiểm "mỗi thửa có lứa đã thu hoạch": nó đã được kiểm theo từng phiếu nguồn.

### 3.25 Chứng nhận (GĐ2)

- **Loại và trường.** `VIETGAP`, `OCOP`, `ORGANIC`, `OTHER`. Số chứng nhận (tối đa 60 ký tự), nơi cấp (120), ngày cấp, ngày hết hạn (không trước ngày cấp), ghi chú phạm vi tuỳ chọn (200); CSDL có `CHECK` cho độ dài, ngày và kích thước.
- **Tệp.** PDF, JPG hoặc PNG, tối đa 10 MB (10.485.760 byte). Máy chủ kiểm **byte đầu của tệp** (`%PDF-`, `FF D8 FF`, chữ ký PNG) và loại khai báo phải khớp; sai thì 400 `FILE_TYPE`, quá lớn 400 `FILE_TOO_LARGE` (từ chối ngay theo `Content-Length` trước khi đọc thân). Tên tệp được làm sạch (chỉ `A-Z a-z 0-9 . _ -`, tối đa 80 ký tự).
- **Nơi lưu.** Tệp nằm trên kho đối tượng của stack (SeaweedFS, qua client S3 `minio`; các biến `MINIO_*` là tên cũ của client, không phải dịch vụ MinIO) trong bucket `agrimarket-private`, khoá `para/<htx_code>/Certificates/<uuid>-<tên đã làm sạch>`. Tải về qua `GET /api/certificates/[id]/file` (chuyển hướng 302 tới liên kết ký sẵn 1 giờ).
- **Trạng thái tính lúc đọc**, không lưu: `REVOKED` khi có `revoked_at`; `EXPIRED` khi ngày hôm nay (giờ Việt Nam) sau `expires_on`; còn lại `VALID`. Đúng ngày hết hạn vẫn còn hiệu lực.
- **Thu hồi** chỉ do `manager`, kèm lý do 3 đến 200 ký tự; thu hồi hai lần trả 409 `CERTIFICATE_REVOKED`. Không xoá chứng nhận. Thêm và xem do `officer` và `manager`.
- **Gắn vào lô khi xuất QR.** `POST /api/lots/[id]/export-qr` nhận `certificate_ids` tuỳ chọn (tối đa 20); không gửi thì gắn mọi chứng nhận còn hiệu lực của HTX. Mỗi chứng nhận gửi lên phải thuộc HTX và còn hiệu lực hôm nay, nếu không 422 `CERTIFICATE_NOT_VALID` kèm `certificate_ids` sai. Khi ghi, giao dịch khoá các dòng chứng nhận (`FOR UPDATE`) và kiểm lại, nên một lần thu hồi vừa xong không lọt; một lần thu hồi đến sau chờ khoá và theo sau lần xuất. `lot_certificates` ghi cặp (lô, chứng nhận); khoá tệp cũng được thêm vào `certificate_keys` để route tải công khai hiện có tiếp tục chạy.

### 3.26 Trang QR công khai duy nhất (GĐ2)

- **Một trang.** Mọi tem trỏ tới `/q/<mã lô>`; ảnh QR khi xuất mã hoá `{gốc}/q/{mã lô}`. Trang cũ `/lot/<mã lô>` đã bỏ; tem in trước đây vẫn chạy nhờ `next.config.js` trả chuyển hướng vĩnh viễn 308 từ `/lot/:lot_code` sang `/q/:lot_code`. Trang không cần đăng nhập.
- **Bốn tầng, theo thứ tự; tầng rỗng bị bỏ:** (1) Vùng trồng; (2) An toàn cách ly; (3) Mẻ sao chế biến (mã mẻ, ngày, kg tươi vào, kg khô ra, tỷ lệ có đánh dấu khi lệch, phần kg của lô); (4) Chứng nhận (loại, số, nơi cấp, hiệu lực, thu hồi). Kèm khối "Kiểm chứng trong sổ audit" (M14).
- **Với lô từ mẻ**, trang tính an toàn theo từng phiếu nguồn (mỗi phiếu theo ngày cân của nó, mục 3.24) và liệt kê từng phiếu nguồn: mã thửa, lứa, ngày cân, kg tịnh, ngày an toàn; không có tên hộ và không có mã phiếu.
- **Chứng nhận đọc trực tiếp lúc dựng trang**, kể cả với lô đã xuất QR: một lần thu hồi hoặc hết hạn sau khi xuất hiện ngay trên trang, dù ảnh chụp lúc xuất vẫn giữ tệp.
- **Tên người ẩn mặc định.** Tên hộ (`household_name`), người ghi nhật ký (`performed_by`) và tên thợ sao (`master_name`) chỉ hiện khi HTX bật `htx_profiles.public_show_names` (mặc định `false`). Việc ẩn làm **lúc dựng trang**, nên áp cả với ảnh chụp lô xuất từ trước. `manager` bật hoặc tắt qua `PUT /api/htx/public-settings`.
- **Tem in.** `officer` và `manager` mở `/officer/lots/[mã lô]/labels` hoặc `/manager/lots/[mã lô]/labels`: chọn khổ 50×30, 40×30 hoặc 60×40 mm và số tem từ 1 đến 500; mỗi tem có QR, mã lô, "Chè {hạng}", khối lượng lô và tên HTX. In bằng hộp thoại in của trình duyệt (lưu PDF bằng trình duyệt); không thêm thư viện PDF.

### 3.27 Bảng điều hành Giám đốc (GĐ3 S7)

`/manager/dashboard` là màn hình buổi sáng của Trưởng HTX; `/accountant/dashboard` dùng cùng bảng cho kế toán. Bảng do `DirectorBoardUseCase.read` dựng ở máy chủ (không có route API riêng). **Mỗi khối tải riêng:** khối hỏng chỉ thành `null` (ghi log, trang hiện "Chưa tải được ..." cho khối đó) và các khối còn lại vẫn có. Ngày "hôm nay" là ngày Việt Nam.

- **Khối 1, búp hôm nay:** tổng kg tịnh, thành tiền và số phiếu của phiếu cân `VALID` cân trong ngày, kèm kg tịnh của hôm qua.
- **Khối 2, giá hôm nay:** giá từng phẩm cấp đang dùng đã công bố trong ngày; `published` là `false` khi chưa phẩm cấp nào có giá.
- **Khối 3, phải trả xã viên:** `unpaid_lines_vnd` (dòng quyết toán của kỳ đã chốt, chưa trả, `payable_vnd` > 0) + `unsettled_leaf_vnd` (tiền phiếu cân `VALID` chưa quyết toán) − `unsettled_advances_vnd` (tiền phiếu ứng `VALID` chưa quyết toán) = `total_vnd`, toàn HTX; tổng có thể âm.
- **Khối 4, tồn chè khô theo hạng:** kg còn lại của mẻ `FINISHED` (mục 3.24), gộp theo cả năm hạng, hạng không có tồn là 0.
- **Khối 5, công nợ thương lái:** tổng phải thu, số đơn và số tiền quá hạn, và ba thương lái nợ nhiều nhất (cách tính ở mục 3.28).
- **Khối 6, cảnh báo.** Mỗi cảnh báo có `kind`, `count`, `message` (tiếng Việt, hiện nguyên văn) và đường dẫn. Thứ tự hiện như bảng dưới. Trưởng HTX thấy cả tám; **kế toán chỉ thấy bốn cảnh báo về tiền** (`ORDERS_OVERDUE`, `SETTLEMENT_DRAFT`, `UNPAID_LINES`, `PRICE_NOT_PUBLISHED`).

| `kind` | Khi nào có | Thông điệp |
|--------|------------|-----------|
| `PARCELS_IN_WITHDRAWAL` | nương còn bị chặn theo quy tắc (a) mục 3.2 với D là hết ngày hôm nay (cùng quy tắc với bàn cân) | `{n} nương đang trong thời gian cách ly` |
| `BATCH_OUT_OF_BAND` | mẻ `FINISHED` có `out_of_band` và `finished_at` trong 30 ngày Việt Nam gần nhất | `{n} mẻ lệch khoảng chuẩn trong 30 ngày` |
| `BATCH_OPEN_TOO_LONG` | mẻ còn `OPEN` có ngày chế biến cách hôm nay từ 3 ngày trở lên | `{n} mẻ còn mở quá 2 ngày` |
| `OLD_DRY_STOCK` | dòng tồn chè khô còn kg lớn hơn 0 của mẻ có ngày chế biến cách hôm nay từ 61 ngày trở lên | `{n} dòng tồn chè khô quá 60 ngày` |
| `ORDERS_OVERDUE` | có đơn bán sỉ quá hạn (mục 3.28); không hiện khi khối 5 hỏng | `{n} đơn bán sỉ quá hạn thanh toán` |
| `SETTLEMENT_DRAFT` | có kỳ quyết toán `DRAFT` (chỉ nêu kỳ mới nhất, `count` luôn 1) | `Kỳ quyết toán {mã kỳ} còn nháp` |
| `UNPAID_LINES` | dòng quyết toán chưa trả (`payable_vnd` > 0) của kỳ chốt trước 00:00 giờ Việt Nam của ngày cách hôm nay 7 ngày, tức chốt hơn 7 ngày trước | `{n} hộ chưa nhận tiền quyết toán quá 7 ngày` |
| `PRICE_NOT_PUBLISHED` | chưa công bố giá hôm nay và đã từ 07:00 giờ Việt Nam; không hiện khi khối 2 hỏng | `Chưa công bố giá thu mua hôm nay` |

Trang không còn ô "Chỉ số giá" `market_data` và các ô diện tích, sản lượng dự kiến; `htx-dashboard` là tab phân tích riêng.

### 3.28 Bán hàng gắn lô và công nợ thương lái (GĐ3 S8)

- **Đơn bán (`sales_orders`)** có `kind` `WHOLESALE` (bán sỉ cho thương lái, bắt buộc `partner_id` cùng HTX) hoặc `RETAIL` (bán lẻ từ mini-app, không có `due_on`), `source` `CORE` hoặc `TEA_SHOP`, trạng thái `CONFIRMED` hoặc `CANCELLED`. Số đơn `{HTX}-DH-YYYYMMDD-NNN`, `YYYYMMDD` là ngày đặt, `NNN` đánh từ 001 dưới khoá tư vấn theo HTX và ngày. Đơn tạo ra là `CONFIRMED` ngay.
- **Khối lượng bán tính bằng gam.** `sales_order_lines.net_g` là số nguyên gam lớn hơn 0. Dòng sỉ nhập kg một chữ số thập phân (lớn hơn 0, tối đa 1.000.000) và đổi sang gam theo phần mười kg (1,1 kg là đúng 1.100 g). Dòng lẻ có `pack_count` và `pack_net_g`, và `net_g = pack_count × pack_net_g` (4 gói 250 g là đúng 1.000 g); CSDL buộc cả hai cùng có hoặc cùng rỗng và khớp công thức.
- **Tiền dòng.** Dòng sỉ: `amount_vnd = price_vnd_per_kg × net_g / 1000`, làm tròn đến đồng, **nửa làm tròn lên**, tính bằng số nguyên (giá nguyên từ 1 đến 10.000.000 đ/kg). Dòng lẻ: `amount_vnd` do mini-app gửi (giá gói × số gói, đã tính khuyến mãi). `total_vnd` là tổng các dòng.
- **Tồn của lô, một chỗ duy nhất.** Lô bán được khi `status = QR_EXPORTED`, thuộc HTX và có khối lượng. **Sức chứa = (`total_weight_kg`, nếu rỗng thì `actual_weight_kg`, nếu rỗng thì `estimated_weight_kg`) × 1000, làm tròn đến gam. Còn lại = sức chứa − tổng `net_g` của các dòng thuộc đơn `CONFIRMED`.** Huỷ đơn thì phần đã bán tự quay về tồn. `GET /api/sales/sellable-lots` chỉ liệt kê lô còn lại lớn hơn 0.
- **Tạo đơn trong một giao dịch, khoá theo thứ tự lô rồi số đơn.** (1) Khoá các dòng lô được chọn theo thứ tự id (`FOR UPDATE`); (2) lô không thuộc HTX trả 404; lô chưa xuất QR hoặc chưa có khối lượng trả 422 `LOT_NOT_SELLABLE`; (3) số gam cần (cộng các dòng cùng lô) lớn hơn số còn lại trả 409 `LOT_STOCK_SHORT` kèm số gam còn lại từng lô; (4) rồi mới lấy số đơn dưới khoá tư vấn và ghi. Nhờ khoá lô trước, hai đơn cùng lô không bán vượt tồn.
- **Hạn thanh toán và quá hạn.** Đơn sỉ có `due_on` mặc định `ordered_on` cộng 30 ngày, sửa được và không trước ngày đặt (cả CSDL lẫn API). **Quá hạn** khi đơn sỉ `CONFIRMED`, còn phải thu lớn hơn 0 và `due_on` trước hôm nay (ngày Việt Nam).
- **Công nợ thương lái** chỉ tính trên đơn `WHOLESALE` `CONFIRMED`: phải thu = `total_vnd` − tổng đã thu. **Đơn lẻ không vào công nợ** (thanh toán khi giao hàng). Bảng công nợ gộp theo thương lái, nợ nhiều nhất trước.
- **Thu tiền (`sales_payments`)** do `manager` hoặc `accountant` ghi, chỉ trên đơn `CONFIRMED`, dưới khoá dòng đơn: số tiền nguyên từ 1 đến 1.000.000.000.000 đ, **không vượt số còn phải thu** (vượt thì 409 `OVERPAYMENT` kèm `outstanding_vnd`). Mã hiện không chặn thu tiền trên đơn lẻ (`RETAIL`), nhưng đơn lẻ không vào công nợ. Bảng chỉ thêm: trigger từ chối `UPDATE`, `DELETE` và `TRUNCATE`; không có sửa hay xoá khoản thu.
- **Huỷ đơn** chỉ `manager`, kèm lý do 3 đến 200 ký tự. Đơn đã có khoản thu không huỷ được (409 `ORDER_HAS_PAYMENTS`); đơn đã huỷ trả 409 `ORDER_CANCELLED`. Đơn lẻ của mini-app huỷ theo `external_ref`; huỷ lần hai trả đúng đơn đã huỷ, không lỗi.
- **Đổi hạn thanh toán** (`PATCH`) do `manager` hoặc `accountant`, chỉ với đơn sỉ còn `CONFIRMED` và còn nợ: đơn lẻ 422 `NOT_WHOLESALE`; đơn đã huỷ 409 `ORDER_CANCELLED`; đơn đã thu đủ 409 `ORDER_PAID`; hạn trước ngày đặt 400 `VALIDATION_ERROR`.
- **Quyền.** `manager` và `accountant` tạo đơn sỉ, ghi thu, đổi hạn, xem đơn và công nợ; chỉ `manager` huỷ. Kế toán đọc được danh sách đối tác (`GET /api/partners`) để chọn thương lái; sửa đối tác vẫn chỉ `manager`.
- **Không gửi tin ra ngoài.** Quá hạn chỉ hiện thành cảnh báo trên bảng điều hành (mục 3.27).

### 3.29 Core Action API cho mini-app (GĐ3 S8)

Cách một mini-app ghi vào lõi mà không giữ bảng cô lập (`/api/internal/apps/*`).

- **Chỉ ở cổng nội bộ 9081.** Route APISIX `internal-apps` có điều kiện `server_port == 9081`, nên cổng 9080 mở ra ngoài không chạm tới. Route chạy plugin `openid-connect` (cấu hình chung `oidc_aud` của gateway), giới hạn 120 yêu cầu mỗi phút theo header `Authorization`, và gắn header `X-Dxos-Gateway` bằng bí mật `DXOS_INTERNAL_GATEWAY_SECRET`.
- **Mini-app chuyển nguyên token của người đang dùng.** Không có token dịch vụ nào của app: `Authorization: Bearer <token của chính Trưởng HTX>` đi từ trình duyệt qua web proxy tới mini-app và tiếp tới lõi.
- **Web kiểm lại token** (`requireAppUserCaller`), không đọc phiên: (1) header `X-Dxos-Gateway` phải đúng bí mật, nếu không 403 `INTERNAL_GATEWAY_REQUIRED`; thiếu bearer thì 401; (2) chữ ký RS256, thời hạn, `iss` và `aud` (`dx-os-core`) phải hợp lệ, nếu không 401; (3) **`azp` phải là client đăng nhập của web** (`KEYCLOAK_CLIENT_ID`, mặc định `nextjs-web`), nếu không 401; (4) token mang vai dịch vụ (`agent`, `telegram`, `staff-sync`, `web-service`) bị từ chối 403, kể cả khi có thêm vai người; (5) phải có claim `htx_code` hợp lệ, nếu không 403; (6) **vai `manager` là bắt buộc** (kế toán, cán bộ và nông dân nhận 403); (7) HTX lấy từ `htx_code` của token và phải có trong CSDL (nếu không 401), nên người gọi không bao giờ chạm HTX khác.
- **Ba hành động** hiện có, đều dưới `/api/internal/apps/sales/`: đọc lô bán được, ghi đơn lẻ, huỷ đơn lẻ. Đơn lẻ nhận `external_ref` (mã đơn của mini-app, `[A-Za-z0-9_-]`, 1 đến 64 ký tự) làm khoá chống trùng cùng với nguồn `TEA_SHOP`: gửi lại cùng `external_ref` trả đơn đầu tiên (200) và không trừ tồn thêm, kể cả hai lần gửi đua nhau (khoá tư vấn theo `external_ref`). Ngày đặt của đơn lẻ luôn là hôm nay; trường `ordered_on` được chấp nhận nhưng bị bỏ qua.
- **tea-shop 0.4.0** dùng API này để bán gói chè từ lô thật (xem [miniapps.md](./miniapps.md) và README của app): lỗi `LOT_STOCK_SHORT` thì đơn không được xác nhận; lõi không trả lời hoặc lỗi 5xx thì cũng không xác nhận và báo thử lại.

### 3.30 Báo cáo vụ và năm cho Đại hội thành viên (GĐ3 S9)

- **Kỳ báo cáo** là hai ngày Việt Nam `from` và `to`, gồm cả hai đầu: `from` không sau `to`, tối đa ba năm (1.098 ngày, tức 3 × 366); ngày phải có thật. Trang chọn kỳ có "năm nay", "năm trước" (cả năm dương lịch) và khoảng tự chọn. `manager` và `accountant` xem được; `/manager/reports/view` và `/accountant/reports/view` dựng khổ A4 (in hoặc lưu PDF bằng trình duyệt) kèm tên HTX, kỳ, giờ lập và hàng chữ ký.
- **Bảy phần, mỗi phần tính riêng**; phần lỗi thành `null` (ghi log, trang hiện "Chưa tải được phần này") và các phần còn lại vẫn có.
- **Cách tính theo kỳ.** (1) Thành viên: số hộ, số thửa, diện tích, tính **tại thời điểm xem**, không theo kỳ. (2) Thu mua: phiếu cân `VALID` theo ngày cân (giờ Việt Nam), gộp theo tháng và theo phẩm cấp. (3) Tiền xã viên: kỳ quyết toán theo `closed_at` (số kỳ đã chốt, tiền đã chi trả, còn phải trả của kỳ đó), cộng tiền phiếu ứng `VALID` theo `advanced_on`. (4) Chế biến: mẻ `FINISHED` theo `finished_at` (số mẻ, kg tươi, kg khô, tỷ lệ bình quân = tổng tươi / tổng khô làm tròn 2 chữ số, số mẻ lệch, kg khô theo năm hạng). (5) Lô: lô theo `created_at` (số lô, số lô đã xuất QR, kg; lô từ mẻ tính theo kg nguồn mẻ, lô cũ theo khối lượng khai trên lô); chứng nhận còn hiệu lực **vào ngày `to`** (chưa thu hồi, đã cấp đến hết `to`, hết hạn từ `to` trở đi). (6) Bán hàng, theo kế hoạch: doanh thu sỉ và lẻ của đơn `CONFIRMED` theo `ordered_on`; kg bán; phải thu cuối kỳ của đơn sỉ, chỉ tính các khoản thu có `paid_on` đến hết `to`; 10 thương lái có doanh số lớn nhất. (7) An toàn: số lần phun `SPRAYING` đã `APPROVED` theo `entry_date`, và số lứa được thu hoạch (`parcel_crop_cycles.harvested_at`) trong kỳ.
- **CSV theo phần.** `GET /api/reports/season.csv?from=&to=&section=`, mỗi phần một bảng cột tiếng Việt (UTF-8 có BOM). Phần chưa có dữ liệu để xuất (phần đã hỏng, hoặc `null`) trả **503 `SECTION_UNAVAILABLE`**, không phải tệp rỗng.

## 4. Security Rules

### 4.1 Authentication
```
- All routes under /manager/, /officer/, /farmer/, /accountant/, /platform/ require valid session
- Session validation: server-side only via NextAuth.js auth()
- Role check: read from Keycloak token claim 'realm_access.roles'
- Session timeout: 8 hours (Keycloak configured)
- Passkey (WebAuthn) is primary method; PIN fallback allowed
- NO password storage in application — Keycloak owns all credentials
```

**Vai và nhiều vai (GĐ1 S2).**

- **Năm vai người dùng:** `manager`, `officer`, `accountant`, `farmer` (thuộc một HTX) và `platform_admin` (không thuộc HTX nào, không có `htx_code`). Không bao giờ đặt vai tên `admin`: Hasura coi đó là siêu quản trị.
- **Một người có thể giữ nhiều vai.** Vai thật nằm ở realm roles của Keycloak; đó là nguồn sự thật. Phiên (`session.user.roles`) giữ mọi vai của token và một vai đang dùng (`session.user.role`). Vai mặc định theo thứ tự ưu tiên `manager`, `officer`, `accountant`, `farmer`, `platform_admin`.
- **Vai đang dùng chỉ là ngữ cảnh giao diện, không phải ranh giới bảo mật.** Quyền thật đến từ token Keycloak: middleware, `requireTenant()` và từng route đều xét lại vai đang dùng, và cookie phiên không thêm được vai mà token không có. Đổi vai bằng `POST /api/session/role`: route kiểm vai đó có nằm trong vai người này giữ (403 nếu không), rồi callback `jwt` kiểm lần nữa trước khi đổi `role`. Vai không giữ không bao giờ đặt được, kể cả khi client tự gọi cập nhật phiên. Đổi vai ghi một dòng log `role.switch` (chưa có bản ghi kiểm toán trong web).
- **Giới hạn đã chấp nhận.** Mini-app, Hasura, Telegram và app di động xét theo mọi vai trong token, không theo vai đang dùng; chỉ các route web xét vai đang dùng, nên chặt hơn. Vì vậy một người giữ nhiều vai có quyền của tất cả các vai đó ở các kênh này, bất kể đang chọn vai nào.
- **Truy cập khu vực.** Middleware chỉ cho `/manager`, `/officer`, `/farmer`, `/accountant` và `/platform` khi vai đang dùng khớp. Người giữ vai đó nhưng chưa chọn thì được dẫn tới `/unauthorized?switch=<vai>` có nút đổi vai; vai không giữ thì `/unauthorized`. `platform_admin` không qua được `requireTenant()` (không có HTX); các route của vai này dùng `requirePlatformAdmin()`.
- **`htx_memberships`.** Bảng `(keycloak_user_id, htx_profile_id, roles[])` ghi lại các vai của một người trong một HTX. Keycloak vẫn là nguồn sự thật: `requireTenant()` đồng bộ dòng này từ token ở mỗi lần gọi (bộ vai đã ghi trong tiến trình thì bỏ qua; thêm và bớt, bỏ qua `platform_admin`, không bao giờ chặn request khi ghi lỗi); mời thành viên, sửa vai và tạo HTX cũng đồng bộ.
- **TOTP là tuỳ chọn** cho mọi vai, kể cả `manager` và `officer`: tài khoản mới không bị ép `CONFIGURE_TOTP`. Người dùng đang chạy thật còn treo yêu cầu này không tự bị sửa (xem [dev-setup.md](./dev-setup.md)).
- **Mời thành viên không cần email.** `POST /api/members/invite` chỉ cần tên, số điện thoại, mã PIN và vai; Keycloak không bắt buộc email. Đăng nhập bằng số điện thoại.
- **Cấu hình AI và hạn mức USD hằng tháng của agent** do `platform_admin` đặt cho từng HTX (`GET` và `PUT /api/platform/htx/[code]/agent-settings`). `manager` và `officer` chỉ đọc `GET /api/agent/settings` (`can_edit` luôn `false`); `PUT /api/agent/settings` trả 403 `FORBIDDEN`.
- **Tài khoản `platform_admin`** tạo bằng `kcadm` (xem [dev-setup.md](./dev-setup.md)). Cổng `/api/dev-login?role=` chỉ chạy ở môi trường phát triển và nhận cả năm vai.

### 4.2 Authorization Matrix

| Action | manager | officer | farmer |
|--------|---------|---------|--------|
| View bulletin + chatbot | ✅ | ✅ | ❌ |
| View partner map | ✅ | ✅ | ❌ |
| Read partners (`GET /api/partners`, only the caller's HTX; the accountant also reads, see the table below) | ✅ | ✅ | ❌ |
| CRUD partners (only the caller's HTX) | ✅ | ❌ | ❌ |
| List members (`GET /api/members`, only the caller's HTX) | ✅ | ✅ | ❌ |
| Global search (`GET /api/search`) | ✅ | ✅ | ❌ |
| View farm zone map | ✅ (read) | ✅ (write) | ❌ |
| CRUD households + parcels | ❌ | ✅ | ❌ |
| Create journal entries | ❌ | ✅ | ✅ (own) |
| Approve journal entries | ✅ | ✅ | ❌ |
| Create + export lots | ❌ | ✅ | ❌ |
| View lots | ✅ | ✅ | ❌ |
| Submit disease diagnosis | ❌ | ✅ | ✅ |
| View disease results | ✅ | ✅ | ✅ (own) |
| View notifications | own only | own only | own only |
| View QR public page | ✅ (no auth) | ✅ (no auth) | ✅ (no auth) |

Bảng trên chỉ có ba cột. Quyền của `accountant` và `platform_admin`, và các hành động GĐ1, nằm ở bảng bổ sung dưới đây (cột "Vai được phép" là các vai đang dùng; mọi route đều chỉ tính trong HTX của phiên, trừ `/api/platform/*`):

| Hành động | Vai được phép |
|-----------|---------------|
| Xem danh mục thuốc BVTV (`GET /api/pesticides`) | manager, officer, farmer |
| Đặt hoặc xoá nhãn thuốc của HTX (`PUT`, `DELETE /api/pesticides/[id]/label`) | manager, officer |
| Sửa danh mục thuốc chung (`PUT /api/platform/pesticides/[id]`) | platform_admin |
| Duyệt thu hoạch (`POST /api/parcels/[id]/approve-harvest`) | manager, officer |
| Gửi lại nhật ký bị trả hoặc xác nhận "Đã phun" (`PUT /api/journal/[id]` với `submit`) | farmer (hộ của mình) |
| Kê đơn khi xác nhận ca bệnh (`PUT /api/officer/diseases/[id]/review`) | officer |
| Sửa vai thành viên (`PUT /api/members/[id]/roles`; chỉ farmer, officer, accountant) | manager |
| Tạo HTX và Trưởng HTX đầu tiên (`POST /api/platform/htx`) | platform_admin |
| Đọc và lưu cấu hình AI của một HTX (`/api/platform/htx/[code]/agent-settings`) | platform_admin |
| Đọc cấu hình AI của HTX (`GET /api/agent/settings`, chỉ đọc) | manager, officer |
| Đổi vai đang dùng (`POST /api/session/role`) | mọi người đã đăng nhập, chỉ sang vai mình giữ |
| Đọc phẩm cấp và giá hôm nay (`GET /api/leaf-grades`, `GET /api/leaf-prices/today`) | mọi vai của HTX |
| Thêm hoặc sửa phẩm cấp, công bố giá (`POST /api/leaf-grades`, `PUT /api/leaf-grades/[id]`, `PUT /api/leaf-prices/today`) | manager |
| Tạo phiếu cân (`POST /api/leaf-tickets`) | accountant, manager |
| Huỷ phiếu cân (`POST /api/leaf-tickets/[id]/void`) | accountant, manager |
| Danh sách phiếu, tìm hộ (`GET /api/leaf-tickets`, `GET /api/households`) | manager, accountant, officer |
| Xuất CSV phiếu cân (`GET /api/leaf-tickets/export.csv`) | manager, accountant |
| Xem một phiếu (`GET /api/leaf-tickets/[id]`) | manager, accountant, officer; farmer chỉ phiếu của hộ mình |
| Phiếu của tôi (`GET /api/leaf-tickets/mine`) | farmer |
| Danh sách vật tư (`GET /api/input-items`) | manager, accountant, officer |
| Thêm hoặc sửa vật tư (`POST /api/input-items`, `PUT /api/input-items/[id]`) | manager, accountant |
| Ghi hoặc huỷ phiếu ứng (`POST /api/input-advances`, `POST /api/input-advances/[id]/void`) | accountant, manager |
| Danh sách phiếu ứng (`GET /api/input-advances`) | manager, accountant, officer |
| Xuất CSV phiếu ứng (`GET /api/input-advances/export.csv`) | manager, accountant |
| Danh sách ngân hàng (`GET /api/banks`) | mọi vai của HTX |
| Đặt hoặc đọc tài khoản nhận tiền của hộ (`PUT`, `GET /api/households/[id]/bank`) | manager, accountant |
| Đọc sổ của một hộ (`GET /api/households/[id]/ledger`) | manager, accountant |
| Sổ của tôi (`GET /api/ledger/mine`) | farmer |
| Tạo kỳ, xem danh sách và chi tiết kỳ (`POST`, `GET /api/settlements`, `GET /api/settlements/[id]`) | manager, accountant |
| Chốt kỳ (`POST /api/settlements/[id]/close`) | manager |
| Ghi chi trả (`POST /api/settlements/[id]/lines/[lineId]/payout`) | accountant, manager |
| Phiếu quyết toán (`GET /api/settlements/[id]/lines/[lineId]/slip`) | manager, accountant; farmer chỉ phiếu của hộ mình (số tài khoản che) |
| Điều chỉnh sổ (`POST /api/ledger/adjustments`) | manager |
| Danh sách và chi tiết mẻ, phiếu chọn được (`GET /api/processing-batches`, `GET /api/processing-batches/[id]`, `GET /api/processing-batches/available-tickets`) | officer, manager |
| Mở mẻ, thêm hoặc bỏ phiếu, đặt sản lượng, hoàn thành, huỷ (`POST /api/processing-batches`, `POST .../[id]/tickets`, `DELETE .../[id]/tickets/[ticketId]`, `PUT .../[id]/outputs`, `POST .../[id]/finish`, `POST .../[id]/cancel`) | officer, manager |
| Tồn chè khô (`GET /api/dry-stock`) | officer, manager |
| Đóng lô từ mẻ (`POST /api/lots/from-batches`) | officer, manager |
| Danh sách lô và chi tiết lô (`GET /api/lots`, `GET /api/lots/[id]`) | officer, manager |
| Xuất QR (`POST /api/lots/[id]/export-qr`) | officer, manager |
| Tạo lô từ thửa (`POST /api/lots`, đóng băng sau `DXOS_LABS`) | officer |
| Danh sách, thêm, tải chứng nhận (`GET`, `POST /api/certificates`, `GET /api/certificates/[id]/file`) | officer, manager |
| Thu hồi chứng nhận (`POST /api/certificates/[id]/revoke`) | manager |
| Đọc cài đặt tên công khai (`GET /api/htx/public-settings`) | manager, officer |
| Bật hoặc tắt tên công khai (`PUT /api/htx/public-settings`) | manager |
| Xem trang QR công khai (`/q/[mã lô]`) | không cần đăng nhập |
| Đọc danh sách đối tác (`GET /api/partners`; thêm ở GĐ3) | manager, officer, accountant |
| Bảng điều hành (`/manager/dashboard`, `/accountant/dashboard`; không có route API) | manager (đủ 8 cảnh báo); accountant (4 cảnh báo về tiền) |
| Lô bán được, danh sách và chi tiết đơn, công nợ (`GET /api/sales/sellable-lots`, `GET /api/sales/orders`, `GET /api/sales/orders/[id]`, `GET /api/sales/receivables`) | manager, accountant |
| Tạo đơn sỉ, ghi thu tiền, đổi hạn thanh toán (`POST /api/sales/orders`, `POST /api/sales/orders/[id]/payments`, `PATCH /api/sales/orders/[id]`) | manager, accountant |
| Huỷ đơn (`POST /api/sales/orders/[id]/cancel`) | manager |
| Core Action API cho mini-app (`GET /api/internal/apps/sales/sellable-lots`, `POST /api/internal/apps/sales/retail-orders`, `POST /api/internal/apps/sales/retail-orders/[external_ref]/cancel`) | token của chính manager, chỉ ở cổng nội bộ 9081 |
| Báo cáo vụ/năm (`/manager/reports`, `/accountant/reports`, `GET /api/reports/season.csv`) | manager, accountant |
| Đèn cách ly của nương (`GET /api/parcels/[id]/withdrawal-status`) | accountant, manager, officer |
| Đối chiếu cân và nhật ký của lứa (`GET /api/cycles/[id]/weighing-summary`) | manager, officer |

> **Luật `never` (không công tắc nào mở lại được):** `harvest.approve`, `journal.approve` và mọi hành động có `money` luôn ở mức `never`: chỉ người ký. Đề xuất vẫn có thể được soạn, nhưng không bao giờ tự chạy, kể cả khi bật tự vận hành. Test khoá luật này.

> **AI Agents (`agent` role, M1b):** Service accounts `dxos-agent-<htx>` read HTX-scoped non-PII tables only through the read-only Hasura `agent` role (personal columns such as farmer `name`, `phone`, `address`, `performed_by`, and user IDs are hidden), ingest runs and proposals only through `/api/internal/agent/*` on internal gateway port `9081`, and cannot call any business write API.

### 4.3 Data Privacy
```
- Farmer personal data (name, phone) visible only to manager and officer
- Disease photos stored in private MinIO bucket — pre-signed URL expires in 1h
- QR public page: contains NO personal data — only crop/lot/process info
- Notification content: recipient sees only their own notifications
- robots.txt: Allow /lot/, /q/, /htx/ (public traceability pages indexed) + Disallow /manager/, /officer/, /farmer/, /api/ (private areas not indexed)
```

### 4.4 MinIO Bucket Policy
```
Kho đối tượng: SeaweedFS của stack, gọi qua client S3 `minio` (các biến `MINIO_*` là tên cũ của client).
Bucket duy nhất mà mã dùng: agrimarket-private (mặc định của MINIO_BUCKET_NAME)
  - para/<htx_code>/...  → khoá nằm dưới thư mục tài liệu của HTX; khoá của HTX khác trả 404
      Areas/Journal/      → ảnh nhật ký (nông dân, cán bộ tải lên)
      Certificates/       → tệp chứng nhận (officer, manager tải lên; GĐ2)
      Archives/           → hồ sơ tự lưu (báo cáo bệnh đã duyệt, mã QR và hồ sơ truy xuất lô đã xuất)
      Archives/Disease_Photos/ → ảnh bệnh; `StoragePort.uploadFile` cũng ghi ảnh mã QR của lô vào đây, đọc bằng liên kết ký sẵn 15 phút

Rule: Pre-signed upload URL expires: 15 minutes
Rule: Pre-signed read URL expires: 60 minutes
```

> Bảng cũ liệt kê thêm bucket `agrimarket-public` (thư mục `qr-codes/`) và các thư mục `disease-photos/`, `documents/`, `journal-photos/`. Mã hiện không dùng bucket công khai nào và không ghi vào các thư mục đó: chỉ có `agrimarket-private` với khoá `para/<htx>/...`; trang `/q` và `/htx` công khai đọc dữ liệu qua máy chủ chứ không đọc thẳng từ bucket.

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
- Tham khảo DESIGN.md tại gốc repo cho component patterns chuẩn
```

### 5.2 Naming Conventions
```
Code files:       kebab-case.ts              (bulletin-service.ts)
Interfaces:       PascalCase                 (BulletinRepository — không dùng IPrefix)
Types:            PascalCase                 (JournalEntryStatus)
Enums:            PascalCase + UPPER value   (enum LotStatus { DRAFT = 'draft' })
Constants:        SCREAMING_SNAKE_CASE       (MAX_WITHDRAWAL_DAYS)
DB columns:       snake_case                 (safe_harvest_date)
API routes:       kebab-case                 (/api/journal-entries)
Env vars:         SCREAMING_SNAKE_CASE       (OLLAMA_MODEL)
Root OSS docs:    UPPER_SNAKE_CASE.md        (README.md, DESIGN.md, CHANGELOG.md)
Docs in docs/:    kebab-case.md / README.md  (business-analysis.md, product-roadmap.md)
ADR files:        NNNN-kebab-case.md         (0005-multi-tenant-tea-value-chain-dxos.md)
Specs & Plans:    YYYY-MM-DD-kebab-case.md   (2026-11-23-agentic-layer-design.md)
Daily timelines:  YYYY-MM-DD.md              (docs/timelines/2026-11-28.md)
Template dirs:    English kebab-case         (docs/templates/para-tea-cooperative/)
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
