# Rules & Limits — DX-AgriMarket

> Tài liệu này định nghĩa tất cả **ràng buộc cứng** của hệ thống.
> Agent và developer PHẢI đọc file này trước khi implement bất kỳ feature nào.
> Mọi vi phạm đều cần justification rõ ràng và approval từ team lead.

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
- Officer and manager can APPROVE or REJECT (pending_approval → approved/rejected)
- Rejecting or requesting changes keeps the entry out of APPROVED (`REJECTED` or `REQUEST_CHANGES`) and stores the reason in `review_note`
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

### 3.18 Tin thoại Telegram (M15)

- **Chỉ trên máy chủ của HTX:** tin thoại được `dxos-telegram` tải về bộ nhớ và gửi tới `dxos-stt` (whisper.cpp) trong mạng Docker. Âm thanh không ghi ra đĩa ở rơle, không đi tới web, nhà cung cấp AI hay dịch vụ nào khác; chỉ phần chữ được chuyển tiếp. `DXOS_STT_URL` chỉ nhận máy `dxos-stt`, `localhost` hoặc địa chỉ riêng; địa chỉ công khai bị từ chối lúc khởi động (tin thoại báo chưa nghe được, chat chữ vẫn chạy).
- **Giới hạn:**
  - tối đa 60 giây và 2 MB mỗi tin thoại; dài hơn thì không tải về và trả lời `Tin thoại dài quá 60 giây. Bạn nói ngắn hơn hoặc nhắn chữ nhé.`;
  - chờ `dxos-stt` tối đa 30 giây, không thử lại; chữ nhận được cắt ở 500 ký tự;
  - chỉ trong chat riêng; tin thoại trong nhóm bị bỏ qua.
- **Tin thoại không tự làm gì:** bot trả lời `Em nghe được: “…”` kèm `Đúng`, `Sửa`, `Huỷ`, giữ chữ 10 phút. Chỉ `Đúng` đưa chữ đi tiếp như người dùng tự gõ; việc ghi dữ liệu vẫn cần thẻ và nút Xác nhận như mục 3.11.
- **Không có `dxos-stt`:** trả lời `Chưa nghe được tin thoại lúc này. Bạn nhắn chữ giúp nhé.`, không ảnh hưởng chức năng khác. Im lặng hoặc chỉ có tiếng ồn: `Chưa nghe rõ. Bạn nói lại hoặc nhắn chữ nhé.`.
- **Mô hình:** mặc định `small` (`DXOS_STT_MODEL`), tải một lần bằng `make up-voice` và kiểm SHA-256. Chọn mô hình nhỏ nhất nghe được giọng của HTX bằng `make stt-measure DIR=<thư mục .ogg kèm .txt>` (đo tỉ lệ sai từ và thời gian của `base`, `small`, `medium`).

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
| Approve journal entries | ✅ | ✅ | ❌ |
| Create + export lots | ❌ | ✅ | ❌ |
| View lots | ✅ | ✅ | ❌ |
| Submit disease diagnosis | ❌ | ✅ | ✅ |
| View disease results | ✅ | ✅ | ✅ (own) |
| View notifications | own only | own only | own only |
| View QR public page | ✅ (no auth) | ✅ (no auth) | ✅ (no auth) |

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
