# API Contract — OpenTea DX-OS

**Base URL (local):** `http://localhost:3000/api` (Web) · `http://localhost:9080` (APISIX Gateway)
**Base URL (prod):** `https://{domain}/api`
**Auth:** Bearer token (Keycloak OIDC / NextAuth.js session cookie) — all routes except `/lot/[code]` & `/htx/[code]` public pages
**Response format:** `{ data: T }` success · `{ error: { code, message } }` error
**Validation:** Zod at route handler layer, before UseCase
**Strategic Direction:** Xem [business-analysis.md](./business-analysis.md) và [product-roadmap.md](./product-roadmap.md) cho các endpoint chuỗi giá trị chè hợp nhất (GĐ1–GĐ3).

---

## Auth

### `GET /api/auth/session`
Returns current session (NextAuth built-in).
```json
{ "user": { "id": "uuid", "email": "...", "role": "manager|officer|accountant|farmer|platform_admin", "roles": ["manager", "farmer"], "name": "..." } }
```
`roles` là mọi vai Keycloak người này giữ; `role` là vai đang dùng (đổi bằng `POST /api/session/role`).

---

## Bulletin (Manager)

### `GET /api/bulletin`
Returns the latest bulletin per commodity.

**Query:** `?commodity=Tea` (optional; defaults to the HTX's first crop: `Tea` for any tea variety such as `Chè Trung du`, otherwise its English commodity name)

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "commodity": "Tea",
    "bulletin_vi": "Thị trường chè Thái Nguyên tuần này...",
    "sources_json": [
      { "source": "COMTRADE", "metric": "export_value_to_world", "value": 250, "date": "2025" }
    ],
    "audio_minio_key": "bulletins/tea-2026-08-04.mp3",
    "generated_at": "2026-08-04T10:00:00Z",
    "model_used": "mistral"
  }
}
```

**Roles:** manager, officer

---

### `POST /api/tts`
Generate TTS audio for given text (on-demand, Piper).

**Request:**
```json
{ "text": "Thị trường chè Thái Nguyên tuần này...", "lang": "vi" }
```

**Response:**
```json
{ "data": { "audio_url": "/api/tts/stream?key=bulletins/tea-2026-08-04.mp3" } }
```
Or stream binary audio directly (Content-Type: audio/wav).

**Roles:** manager, officer, farmer

---

## Chatbot (Manager & Officer)

### `POST /api/chatbot`
Send a message to the Chatbot (Ollama/Groq RAG).

**Request:**
```json
{
  "message": "Xuất khẩu chè Việt Nam năm nay thế nào?",
  "type": "market",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```
*Note: `type` can be `"market"` (Manager) or `"technical"` (Officer). Default is `"market"`.*

**Response:**
```json
{
  "data": {
    "reply": "Theo UN Comtrade (HS 0902), kim ngạch xuất khẩu chè Việt Nam năm 2025...",
    "sources": ["COMTRADE 2025", "Frankfurter 2026-08-04"],
    "model": "mistral"
  }
}
```

**Roles:** manager, officer

> **AI Invariant:** Reply MUST cite sources. MUST NOT recommend actions or decisions. For Technical chatbot, MUST NOT answer market price questions.

### `GET /api/chatbot`
Retrieve chat history.

**Query:** `?session_id=chat-uuid&type=market`

---

## Partner Map (Manager)

Mọi route `/api/partners*` chỉ trả và chỉ sửa đối tác của HTX trong phiên (`htx_profile_id` lấy từ phiên). Đối tác của HTX khác trả 404.

### `GET /api/partners`
List the caller's partners with map coordinates. **Roles:** manager, officer (farmer: 403 `FORBIDDEN`).

**Query:** `?type=buyer` (optional filter)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Cty TNHH Trà Xanh Thái Nguyên",
      "type": "buyer",
      "lat": 10.4567,
      "lng": 107.1234,
      "phone": "0901234567",
      "is_verified": true
    }
  ]
}
```

### `POST /api/partners`
Create new partner. **Roles:** manager only (officer, farmer: 403).

**Request:**
```json
{
  "name": "Cty TNHH...",
  "type": "buyer|supplier|service|bank|other",
  "address": "123 Đường ABC, Quận 1, TP.HCM",
  "phone": "090...",
  "website": "https://...",
  "contact_person": "Nguyễn Văn A"
}
```
*Geocoding (Nominatim) done server-side automatically.*

**Response:** `{ "data": { partner } }`

### `PUT /api/partners/[id]`
Update partner. Same body as POST (partial OK). **Roles:** manager only.

### `DELETE /api/partners/[id]`
Delete partner. **Roles:** manager only.

---

## Thành viên và tìm kiếm (GĐ0)

- **`GET /api/members`** và **`GET /api/search`**: chỉ `manager` và `officer`; nông dân nhận 403 `FORBIDDEN`. Kết quả chỉ gồm HTX trong phiên.
- **`POST /api/members/invite`**, **`/api/members/[id]`** và **`PUT /api/members/[id]/roles`**: chỉ `manager`. Chi tiết ở mục "Nhiều vai và quản trị nền tảng (GĐ1 S2)".
- Liên kết trong kết quả tìm kiếm theo vai của người tìm.

## Route đóng băng (ADR 0005)

Các route sau trả 404 `NOT_FOUND` ("Tính năng này chưa mở.") khi `DXOS_LABS` không phải `1` hoặc `true` (mặc định), kiểm tra lúc gọi, không cần dựng lại web:

- `/api/agent/app-requests*` (4 route) và `/api/internal/agent/app-builder/requests*` (5 route): xưởng mini-app.
- `/api/agent/autopilot`, `/api/agent/autopilot/enable`, `/api/agent/autopilot/stop` và `/api/internal/agent/autopilot/tick`: tự vận hành.
- `/api/internal/agent/strategy/inputs` và `/api/internal/agent/strategy/plans`: agent chiến lược.
- `/api/mcp/tools` và `/api/mcp/tools/[name]`: MCP.
- `/api/internal/staff/{attendance,tasks,tasks/[proposal_id]/ack,roster}`: nhân sự.
- `POST /api/lots` (tạo lô từ thửa) và thao tác chat `lot-create` (GĐ2): từ nay lô đóng từ mẻ sao qua `POST /api/lots/from-batches`. Route này trả 404 `NOT_FOUND` như các route trên khi `DXOS_LABS` tắt. Các route lô khác (`GET /api/lots`, `GET /api/lots/[id]`, `POST /api/lots/[id]/export-qr`) vẫn chạy.

Các trang `/manager/ai/apps*`, mục "Tự vận hành" trong cài đặt AI, nhãn "App do AI xây" của Kho ứng dụng cũng ẩn theo công tắc. Các mục dưới đây của hợp đồng mô tả hành vi khi `DXOS_LABS=1`.

---

## Geocode Proxy (internal use)

### `GET /api/geocode?q={address}`
Proxy to Nominatim. Returns lat/lng for address.

**Response:**
```json
{ "data": { "lat": 10.4567, "lng": 107.1234, "display_name": "..." } }
```

---

## Farm Zone — Households (Officer)

### `GET /api/farm/households`
List all households with summary.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "household_code": "HD-001",
      "owner_name": "Nguyễn Văn A",
      "total_area_ha": 1.25,
      "parcel_count": 3
    }
  ]
}
```

### `POST /api/farm/households`
Create household.

**Request:**
```json
{
  "household_code": "HD-001",
  "owner_name": "Nguyễn Văn A",
  "phone": "090...",
  "address": "..."
}
```

---

## Farm Zone — Parcels (Officer)

### `GET /api/farm/parcels`
List all parcels with GeoJSON.

**Query:** `?household_id=uuid&status=growing`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "parcel_code": "TH-001-A",
      "household_id": "uuid",
      "area_ha": 0.45,
      "geojson": { "type": "Polygon", "coordinates": [[...]] },
      "centroid_lat": 10.456,
      "centroid_lng": 107.123,
      "status": "growing",
      "current_crop": "Chè Kim Tuyên"
    }
  ]
}
```

### `POST /api/farm/parcels`
Create parcel with GeoJSON polygon from Leaflet.draw.

**Request:**
```json
{
  "household_id": "uuid",
  "parcel_code": "TH-001-A",
  "name": "Thửa A",
  "geojson": { "type": "Polygon", "coordinates": [[...]] },
  "area_ha": 0.45,
  "centroid_lat": 10.456,
  "centroid_lng": 107.123,
  "current_crop": "Chè Kim Tuyên",
  "soil_type": "Đất phù sa",
  "irrigation_type": "Tưới tràn"
}
```

### `PUT /api/farm/parcels/[id]`
Update parcel. Partial body accepted.

### `DELETE /api/farm/parcels/[id]`
Delete parcel. **Roles:** officer, manager.

### `POST /api/parcels/[id]/start-round`
Start the next tea harvest round on a parcel in `HARVESTED`. **Roles:** officer only (`farmer` and `manager` get 403). No request body.

Atomically moves the parcel to `TENDING` and creates a crop cycle with `season` `Lứa <n>/<year>`, where `n` is the number of cycles of that parcel created in the same calendar year in Asia/Ho_Chi_Minh, plus 1.

**Response:**
```json
{ "data": { "cycleId": "cuid", "season": "Lứa 2/2026" } }
```

**Errors:** 401 not signed in; 403 `FORBIDDEN` or `NO_HTX`; 404 `NOT_FOUND` for a parcel of another HTX (`TenantGuard.parcel`); 422 `DOMAIN_ERROR` `Chỉ bắt đầu lứa mới khi thửa đã thu hoạch` when the parcel is not `HARVESTED`, including a second start, and no cycle is created.

---

## Journal Entries (Officer)

### `GET /api/journal`
List journal entries.

**Query:** `?parcel_id=uuid&status=pending_approval&page=1&limit=20`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "parcel_crop_cycle_id": "uuid",
      "entry_date": "2026-08-04",
      "growth_stage": "Ra búp",
      "observation": "Chè ra búp đều",
      "temperature_c": 32.5,
      "rainfall_mm": 0,
      "status": "pending_approval",
      "activities": [
        {
          "activity_type": "pesticide",
          "product_name": "Carbendazim 500SC",
          "dosage": "1.5 lít/ha",
          "withdrawal_days": 14,
          "safe_harvest_date": "2026-08-18"
        }
      ],
      "recorded_by": { "id": "uuid", "full_name": "Trần Thị B" },
      "created_at": "2026-08-04T08:00:00Z"
    }
  ],
  "meta": { "page": 1, "total": 45 }
}
```

### `POST /api/journal`
Create new journal entry.

**Request:**
```json
{
  "parcel_crop_cycle_id": "uuid",
  "entry_date": "2026-08-04",
  "growth_stage": "Ra búp",
  "observation": "Chè ra búp đều",
  "activities": [
    {
      "activity_type": "pesticide",
      "product_name": "Carbendazim 500SC",
      "dosage": "1.5 lít/ha",
      "withdrawal_days": 14
    }
  ]
}
```
*Weather (temperature, rainfall) auto-attached from `weather_cache` server-side.*

### `POST /api/journal/upload`
Presigned upload URL for a journal photo. **Roles:** farmer, officer.

**Request:**
```json
{ "filename": "lá chè.jpg", "contentType": "image/jpeg" }
```

**Response:**
```json
{ "data": { "uploadUrl": "https://…", "key": "para/TC/Areas/Journal/2026/<uuid>-la_che.jpg" } }
```

`contentType` is `image/jpeg`, `image/png` or `image/webp`. The URL is a presigned `PUT` valid for 900 seconds; it does not bind the content type. The key's year is the year in Vietnam time. The file name keeps only its last path segment, loses Vietnamese marks (`đ` → `d`), collapses `..` to `.`, turns any character outside `A-Z a-z 0-9 . - _` into `_` and keeps its last 100 characters; a name with no letter or digit left becomes `photo.<jpg|png|webp>`. Send the key as `photo_minio_key` to `POST /api/journal`, which accepts only a file key under `para/<htxCode>/Areas/Journal/` (400 `VALIDATION_ERROR` otherwise).

**Errors:** 400 `VALIDATION_ERROR` for another content type or a missing or over-255-character `filename`; 401 not signed in; 403 `FORBIDDEN` for a manager, `NO_HTX` without an HTX.

### `PUT /api/journal/[id]`
Update entry. Only allowed when status = draft.

### `DELETE /api/journal/[id]`
Delete entry. Only allowed when status = draft.

### `POST /api/journal/batch-approve`
Batch approve multiple pending entries. **Roles:** manager.

**Request:**
```json
{ "entry_ids": ["uuid1", "uuid2", "uuid3"] }
```

**Response:**
```json
{ "data": { "approved_count": 3, "failed_ids": [] } }
```

---

## Lots & QR Traceability (Officer)

> Phần này là hợp đồng cũ của lô tạo từ thửa. Từ GĐ2, lô được đóng từ mẻ sao qua `POST /api/lots/from-batches`, xuất QR có thêm chứng nhận và trang công khai là `/q/[lotCode]`: xem mục "Mẻ sao sấy, lô từ mẻ, chứng nhận và trang QR (GĐ2)" bên dưới, nơi các route `GET /api/lots`, `POST /api/lots`, `POST /api/lots/[id]/export-qr` được ghi đúng hành vi hiện tại.

### `GET /api/lots`
List lots.

**Query:** `?status=draft&page=1&limit=20`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "lot_code": "TC-CHÈKIM-20260804-001",
      "crop": "Chè Kim Tuyên",
      "harvest_date": "2026-08-04",
      "estimated_weight_kg": 2500,
      "status": "draft",
      "parcel_count": 3
    }
  ]
}
```

### `POST /api/lots`
Create new lot.

**Request:**
```json
{
  "crop": "Chè Kim Tuyên",
  "harvest_date": "2026-08-04",
  "estimated_weight_kg": 2500,
  "parcel_ids": ["uuid1", "uuid2"],
  "packaging_type": "Túi 25kg",
  "destination": "Cty TNHH Trà Xanh Thái Nguyên",
  "buyer_name": "Nguyễn Văn Mua",
  "certificate_keys": ["cert/uuid.pdf"]
}
```
*`lot_code` auto-generated: `{htx_code}-{CROP}-{YYYYMMDD}-{NNN}`*

### `GET /api/lots/[id]`
Get lot detail with traceability data (all linked journal entries, parcels, weather).

### `POST /api/lots/[id]/export-qr`
Generate QR code + snapshot public page data. **Roles:** officer, manager.

Refused with 422 `DOMAIN_ERROR` unless the lot is `READY`, its withdrawal period has passed (`WITHDRAWAL_NOT_PASSED`), and every parcel of the lot has a crop cycle with `harvested_at` set on or before the lot's `harvest_date`, compared by calendar day in Asia/Ho_Chi_Minh. The parcel status no longer matters, so a lot of an earlier round stays exportable while a new round is `TENDING`.

**Response:**
```json
{
  "data": {
    "lot_code": "TC-CHÈKIM-20260804-001",
    "qr_image_url": "https://minio.../qr/TC-CHÈKIM-20260804-001.png",
    "public_page_url": "https://domain/lot/TC-CHÈKIM-20260804-001"
  }
}
```

---

## Public QR Scan Page (No Auth)

### `GET /lot/[lotCode]` (đã thay bằng `/q/[lotCode]`)
**Từ GĐ2 đường này chỉ trả chuyển hướng 308 tới `/q/[lotCode]`** (`next.config.js`); trang là `/q/[lotCode]`, mục "Mẻ sao sấy, lô từ mẻ, chứng nhận và trang QR (GĐ2)". Mô tả dưới đây là của trang cũ.
**This is a Next.js page route, not an API route.**
Server Component — renders static lot traceability page.

Data served from `lots.public_page_data` (JSONB snapshot, populated at QR export time).

**Rendered blocks:**
1. HTX Info (name, province, crop, certification)
2. Parcel Info (area, location, farmer)
3. Crop Cycle Info (planting → harvest date, estimated yield)
4. Journal Summary (activities count, last pesticide, safe harvest date)
5. Certifications (linked MinIO documents)
6. Disease Reports (if any, confidence ≥ 50%)

**robots.txt:** `Allow: /lot/, /q/, /htx/` + `Disallow: /manager/, /officer/, /farmer/, /api/` (updated from `Disallow: /lot/` — see BUG-07)

---

## Notifications (All roles)

### `GET /api/notifications`
List personal notifications.

**Query:** `?is_read=false&page=1&limit=20`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "journal_approved",
      "title": "Nhật ký được duyệt",
      "body": "Nhật ký ngày 04/08 của thửa TH-001-A đã được duyệt.",
      "link": "/officer/journal?entry=uuid",
      "is_read": false,
      "created_at": "2026-08-04T10:30:00Z"
    }
  ],
  "meta": { "unread_count": 3 }
}
```

### `POST /api/notifications/[id]/read`
Mark notification as read.

### `GET /api/notifications/stream`
Server-Sent Events (SSE) stream for real-time notification count update.

**Response headers:** `Content-Type: text/event-stream`
**Events:** `data: {"unread_count": 3}\n\n`

---

## Disease Diagnosis (Farmer)

### `POST /api/diagnosis`
Upload crop photo → FastAPI inference → return result.

**Request:** `multipart/form-data`
```
image: File (JPEG/PNG, max 5MB)
parcel_id: UUID (optional)
```

**Response:**
```json
{
  "data": {
    "report_id": "uuid",
    "disease_name": "Đạo ôn lá (Blast)",
    "confidence_score": 0.923,
    "image_url": "https://minio.../disease/uuid.jpg",
    "submitted_at": "2026-08-04T14:00:00Z",
    "uncertain": false
  }
}
```

> **AI Invariant:** Response contains disease NAME + CONFIDENCE only. No treatment recommendation.

The route asks disease-api for `model=tea` when the parcel's `crop_type` names `chè`/`tea` as a word (any case; `che` without the grave accent also counts, e.g. `Che shan tuyet`, but `chế`/`chẻ`/`chê` do not; `_` and `-` separate words), otherwise `model=general`. When the result is `uncertain`, `disease_name` is `Không xác định`. Every result, uncertain or not, is stored as a `PENDING` report and broadcast to the HTX's officers; the farmer screen says `Đã gửi cán bộ kỹ thuật xem`. A 503 from the tea model is not retried on the general model: the route answers 503 `AI_UNAVAILABLE` and no report is stored.

**Roles:** farmer, officer

### `PUT /api/officer/diseases/[id]/review`
Officer approves or rejects a pending disease report of their HTX (another HTX's report answers 404).

**Request:**
```json
{
  "status": "CONFIRMED",
  "treatment_recommendation": "Cắt bỏ lá bệnh, phun thuốc theo hướng dẫn",
  "confirmed_diagnosis": "Đốm nâu"
}
```

`status` is `CONFIRMED` or `REJECTED`. For `CONFIRMED`, `treatment_recommendation` and `confirmed_diagnosis` (trimmed, then at most 200 characters; longer answers 400 "Tên bệnh tối đa 200 ký tự.") are required and non-empty; a missing `confirmed_diagnosis` answers 400 `VALIDATION_ERROR` "Vui lòng nhập tên bệnh đã xác nhận trước khi duyệt.". For `REJECTED` both are optional and no confirmed name is stored. Screens show `confirmed_diagnosis` instead of the AI name once it is set.

**Response:** `{ "success": true }`

**Roles:** officer

---

## FastAPI — Disease Classifier Service

**Internal URL (Docker network):** `http://disease-api:8000`
**Called by:** Next.js `/api/diagnosis` route ONLY (not directly by browser)

### `GET /health`
Health check.
```json
{ "status": "ok", "model_loaded": true, "models": { "general": true, "tea": true } }
```
`model_loaded` is the general model, as before; `models` lists each model. Tea is `false` (and `model=tea` answers 503) when its files are missing or `tea_class_names_vi.json` lacks a class id.

### `POST /predict`
Classify crop disease from image.

**Request:** `multipart/form-data`, optional query `model=general|tea` (default `general`; any other value → 400)
```
file: UploadFile (JPEG/PNG)
```

**Response:**
```json
{
  "disease_name_vi": "Đạo ôn lá",
  "disease_name_en": "Leaf Blast",
  "confidence": 0.923,
  "top3": [
    { "label": "leaf_blast", "confidence": 0.923 },
    { "label": "brown_spot", "confidence": 0.051 },
    { "label": "healthy", "confidence": 0.026 }
  ],
  "model": "general",
  "uncertain": false
}
```

`model=tea` uses the tea leaf model (`ai-models/tea_leaf_model.keras`, 8 classes): `disease_name_en` is the readable class id (`brown_blight` → `Brown blight`), `disease_name_vi` comes from `tea_class_names_vi.json`, and `top3` labels are class ids. When the top confidence is below `TEA_CONFIDENCE_THRESHOLD` (default `0.60`, see `ai-models/tea/MODEL_CARD.md`; a value outside (0, 1] stops startup), `uncertain` is `true`, both names are `null` and `top3` is kept. The general model is never `uncertain`. Every tea result, `healthy` included, still needs an officer's review.

---

## Market Data (Read — Manager/Officer)

### `GET /api/market-data`
Read latest market data from PostgreSQL (written by n8n). Từ GĐ0 chỉ còn nguồn thật về chè (Comtrade, mã HS `0902`); các nguồn mô phỏng và lệch miền đã bị xoá cùng dòng cũ của chúng.

**Query:** `?commodity=tea&source=COMTRADE&metric=export_volume`

**Response:**
```json
{
  "data": [
    {
      "source": "COMTRADE",
      "commodity": "tea",
      "metric": "export_volume",
      "value": 6800000,
      "unit": "MT",
      "period": "2026-08",
      "fetched_at": "2026-08-04T06:00:00Z"
    }
  ]
}
```

---

## Mini-app Proxy (`/apps/<id>/...`)

### `GET|POST|PUT|PATCH|DELETE /apps/<id>/<path>`
Forwards a browser request to an installed mini-app through the gateway's internal port: `${CORE_GATEWAY_URL}/apps/<id>/<path>` (`http://apisix:9081` in compose). Not under `/api`, and it does not use the JSON envelope: the app's own response is passed through. The middleware never redirects these paths to `/login`; the route decides.

- **Apps:** only an `id` in `platform.installed_apps`, read on every request with no cache; any other id, or an app removed meanwhile, answers 404. When the list cannot be read, 503.
- **Paths:** a segment that is `.`, `..` or empty, or holds `/`, `\`, `%2e`, `%2f` or `%5c` after decoding, answers 400 and is not forwarded.
- **Cross-site writes:** a request other than `GET`/`HEAD` answers 403 and is not forwarded (public and protected paths alike) when its `Origin` header is present and equals neither `<request scheme>://<Host header>` nor the origin of `AUTH_URL` (`Origin: null` counts as foreign), or when it has no `Origin` but `Sec-Fetch-Site: cross-site`. Without either header the request is forwarded.
- **Enablement:** an installed app is served only to an HTX that enabled it (`platform.app_enablements` has a row for that HTX or for `*`). A public path names its HTX in the segment right after the prefix (`/public/<htxCode>/...`, `^[A-Za-z0-9_-]{1,20}$`); no HTX there, or one that did not enable the app, answers 404 (after the rate limit). A protected path uses the session's HTX; a session without an HTX, or one that did not enable the app, answers 404 (a missing session still answers 401 first). The 404 carries the same CSP headers. When the enablement cannot be read, 503.
- **Public paths** (start with a `routes.public` prefix of the manifest, e.g. `/apps/tea-tour/public/...`; `/apps/<id>/public` without a slash counts as public too): no token is sent; 10 requests per minute per client IP (first `x-forwarded-for` element, counted across every app), then 429. Once 10,000 IPs are tracked in the window, new IPs share one `overflow` bucket with the same limit.
- **Protected paths** (everything else): the user's Keycloak access token is sent as `Authorization: Bearer <token>`; the gateway checks it and the manifest roles (401/403 from the gateway are passed through). With no session or token, the proxy answers 401 with a short Vietnamese HTML page whose sign-in link is `<a href="/login" target="_top">`.
- **Request:** method, body (streamed), query string, `content-type`, `accept` and `content-length` are forwarded; nothing else, so the browser's `cookie`, `authorization` and `x-hasura-*` headers never reach the gateway. Redirects are not followed (`redirect: manual`); timeout 10 s, then 503.
- **Response:** status, body (streamed), `content-type` and `location` only; `set-cookie` and every other app header are dropped. A `location` is kept only when it resolves to the same origin under `/apps/<id>`; any other redirect answers 502 with no `location`. Every response, including the proxy's own 400/401/403/404/429/502/503, adds `Content-Security-Policy: default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'self'` and `X-Content-Type-Options: nosniff`.

Next.js removes a trailing slash with a 308 before the route runs, so `/apps/<id>/` becomes `/apps/<id>`, which is forwarded as `/apps/<id>/`.

---

## App Store (Manager)

Per-cooperative install and removal of mini-apps. The page is `/manager/app-store`. These routes need a signed-in manager (all `force-dynamic`) with an HTX; the HTX and the requester always come from the session, never from the body. The web app never talks to Docker: a request is a row in `platform.app_requests`, and `./dxos worker` on the host carries it out.

### `GET /api/app-store`
**200** `{ "data": { "workerAlive": boolean, "apps": StoreApp[], "created": CreatedApp[] } }`. `workerAlive` is true when the worker heartbeated in the last 30 s, or a request has been `RUNNING` for under 15 minutes (the worker does not heartbeat during an install).

`CreatedApp` (one per app enabled for the HTX that declares a manifest `feed`, read with the manager's role; empty when none): `{ appId, appName, create: { label, href } | null, entries: { label, description, icon: string | null, href }[] }`, every `href` being `/manager/apps/<id><path>`. A feed that cannot be read gives `entries: []`.

`StoreApp`: `{ id, name, version, description, license, publisher, roles: string[], hasPublic: boolean, status, error: string | null, category: 'production' | 'sales' | 'members' | 'tourism' | 'sample' | null, icon: string | null, installedOnServer: boolean, phase: 'prepare' | 'build' | 'register' | null, openHref: string | null }`. `category` and `icon` come from the manifest `store` block (an unknown value is null); `phase` is the step of the open request, or of the newest request when it failed; `openHref` is `/manager/apps/<id><path>` of the first menu entry for managers when the HTX can use the app. `status`, first match wins for the session's HTX: `installing` (open `ENABLE` request), `removing` (open `DISABLE`), `enabled_all` (enabled for `*`, set by `./dxos install`), `enabled`, `failed` (the newest request failed; `error` holds the Vietnamese reason), otherwise `available`.

### `GET /api/app-store/apps/[id]`
**200** `{ "data": StoreAppDetail }`: a `StoreApp` plus `about: string[]` (paragraphs), `menu: { label, path, roles }[]`, `data: string[]`, `personalData: string | null`, `coreReads: string[]`, `requiresCore: string`, `hasDatabase: boolean`, `publicUrl: string | null` (`/apps/<id>/public/<htxCode>`, only when the app has public pages and the HTX can use it), `preview: string[]` (what installing adds), `screenshots: { position, caption, url }[]` and `history` (the 20 newest requests of the HTX for the app). `id` outside `^[a-z][a-z0-9-]{1,30}$` or not in the catalogue: **404** `APP_NOT_FOUND`. Text from the manifest is plain text.

### `GET /api/app-store/apps/[id]/screenshots/[position]`
**200** the stored image bytes with the stored `content-type`, `x-content-type-options: nosniff`, `cache-control: private, max-age=300`. `position` must be `0` to `3`; anything else, or no such image: **404** `APP_NOT_FOUND`.

### `GET /api/app-store/history`
**200** `{ "data": StoreHistoryEntry[] }`, the 50 newest requests of the session's HTX: `{ id, appId, appName, action: 'ENABLE' | 'DISABLE', status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED', requestedByName: string | null, createdAt, finishedAt: string | null, error: string | null }`.

### `POST /api/app-store/requests`
Body `{ "appId": string (^[a-z][a-z0-9-]{1,30}$), "action": "ENABLE" | "DISABLE" }`; other fields are ignored. The requester's name (at most 120 characters) is stored from the session.
**202** `{ "data": { "status": "installing" | "removing" } }`.

| HTTP | code | When |
|------|------|------|
| 400 | VALIDATION_ERROR | Body is not JSON, `appId` or `action` is invalid |
| 401 | UNAUTHORIZED | No session |
| 403 | FORBIDDEN | Not a manager |
| 403 | NO_HTX | The manager has no HTX |
| 404 | APP_NOT_FOUND | `appId` is not in the catalogue |
| 409 | REQUEST_OPEN | The app already has a pending or running request for the HTX (also when two posts race: one unique index decides) |
| 409 | ALREADY_ENABLED | `ENABLE` for an app the HTX already enabled |
| 409 | NOT_ENABLED | `DISABLE` for an app the HTX has not enabled |
| 409 | ENABLED_FOR_ALL | The app is enabled for every HTX by the server administrator |

All errors use `{ "error": { "code", "message" } }`.

---

## Agentic Layer & Journal Review (M1a–M1c)

### Internal agent API (M1b–M1c)
Only reachable through the APISIX internal listener (`apisix:9081`, unreachable on host port `9080`), which overwrites `X-Dxos-Gateway` with `DXOS_INTERNAL_GATEWAY_SECRET` after verifying the caller's Keycloak RS256 bearer JWT (`aud` includes `dx-os-core`, `realm_access.roles` includes `agent`, `htx_code` matches `^[A-Z0-9_-]{1,20}$`, and `azp = dxos-agent-<htx lowercase>`). Both APISIX and `apps/web` enforce these checks (`X-Dxos-Gateway` compared via constant-time HMAC/SHA-256 digest; unauthenticated `/api/internal/*` bypasses browser session redirect only to enter this route-level verification).

`htx_code` always comes from the verified token — any `htx_code` (or `origin`) in the request body is ignored.

- **`POST /api/internal/agent/runs`** — start an agent run record:
  - **Request:** `{ "agent": "journal-review" (known agents only), "trigger": "schedule" | "event" | "manual", "provider"?: string | null, "model"?: string | null, "prompt_version"?: string | null, "input_hash"?: string | null }`.
  - **201** `{ "data": { "id": uuid } }`.
- **`PATCH /api/internal/agent/runs/[id]`** — finish a run record owned by the caller's HTX:
  - **Request:** `{ "status": "ok" | "failed" | "skipped", "provider"?: string | null, "model"?: string | null, "tokens_in"?: int >= 0 | null, "tokens_out"?: int >= 0 | null, "cost_estimate_usd"?: number >= 0 | null, "external_calls"?: int >= 0 | null, "error"?: string (max 2000) | null }`. `cost_estimate` is accepted as an alias of `cost_estimate_usd`. `external_calls` counts every HTTP attempt to an external provider, retries included.
  - **Effects:** `provider` and `model` are written when given. A run with `external_calls > 0` writes one audit event `agent.external_call` (provider, model, agent, `external_calls`; never content). A run with a cost above zero re-checks the cooperative's monthly budget and queues the 80% and 100% warnings to managers once per Vietnam month (failures are logged, never returned).
  - **200** `{ "data": { "id": uuid, "status": "ok" | "failed" | "skipped" } }`.
  - **404** `NOT_FOUND` — unknown run `id` or run belongs to another HTX.
- **`GET /api/internal/agent/settings`** (C1, agent token): the cooperative's settings for the run. `{ "data": { "agents": { "journal-review": { "enabled", "provider", "model", "thresholds" }, "digest": { ... } }, "report_time": "HH:MM", "budget": { "monthly_limit_usd": number | null, "spent_usd": number, "month": "YYYY-MM", "exhausted": bool } } }`. Unset agents come back as `enabled: false, provider: "ollama"`; `report_time` defaults to `18:00`. `exhausted` is true from 100% of the monthly budget until the Vietnam month ends.
- **`GET /api/agent/settings`** (`manager` or `officer`): the same data plus `providers` (`ollama`, and each external provider whose key the agent container reported) and `can_edit` (true for `manager` only).
- **`PUT /api/agent/settings`** (`manager` only): `{ "agents": { "journal-review": { "provider": "ollama" | "anthropic" | "openai", "model": string | null }, "digest": { ... }, "bulletin": { ... } }, "report_time": "HH:MM", "monthly_limit_usd": number > 0 | null }`. Saving never changes `enabled`: an agent is turned on or off only with `./dxos agent enable|disable`, which also creates or removes its Keycloak client. A provider not in `providers` is refused (400), and `openai` without a `model` is refused (400), because the web cannot see whether the installation has a default OpenAI model. Each change is audited by the table's trigger, with the actor `user:<id>`.
- **`POST /api/internal/agent/proposals`** — ingest an `agent`-origin proposal verified against the action catalogue:
  - **Request:** `{ "run_id"?: uuid | null, "agent": "journal-review" (known agents only), "kind": string, "payload": Record<string, unknown>, "reason_vi": string (1–1000), "evidence": { "rows": [...], "sha256": string }, "confidence"?: number (0–1) | null }`. Body size is capped at 256 KiB. A `dedupe_key` sent by the agent is ignored: duplicates are judged by the subjects the proposal acts on.
  - **Evidence rules:** at most 50 rows; `table` is one of `journal_entries`, `parcel_crop_cycles`, `parcels`, `disease_reports`, `sensor_readings`, `weather_cache` or `market_data` (M4); a row with `values` must hash to its `sha256` (canonical JSON, see below); every row must exist in the caller's HTX (checked by the server, not by the agent; `market_data` is shared by all HTX); every subject needs its own row in the catalogue's `subjectTable` (`journal_entries` for `journal.*`, `parcels` for `harvest.approve`, `disease_reports` for `disease.inspection`), and kinds without a `subjectTable` (notifications, `bulletin.publish`) have no subject check.
  - **Human-only fields:** an `agent`-origin payload that carries a field a human adds when deciding (`note_vi` of the notifications) is refused with `INVALID_PAYLOAD`.
  - **Repeat window (M4):** a proposal whose dedupe key was created within the kind's window, in any status, is not created: the answer is the `deduped: true` form below. Windows: 24 h for `notification.internal`, `notification.households` and `harvest.approve`; 72 h for `disease.inspection`; 20 h for `bulletin.publish`; none for the journal kinds.
  - **201** `{ "data": { "id": uuid, "deduped": false } }` — new proposal inserted. Overdue open proposals that cover the same subjects are marked `expired` first.
  - **200** `{ "data": { "id": null, "deduped": true } }` — an open (`proposed` or `approved`) `journal.*` proposal of the HTX already covers one of the subjects (`subject_ids`), or a proposal with the same dedupe key was created within the kind's repeat window (above).
  - **Kinds (M4)**, payloads are strict objects (unknown keys are refused):

| kind | payload | risk · approvers · expiry | on approval |
|------|---------|---------------------------|-------------|
| `notification.internal` | `{ template: "sensor_silent", slots: { parcel_code, sensor, hours (6–720) }, subjects: string[1..20], note_vi?: ≤500 }` | low · manager · 24 h | `BroadcastAnnouncementUseCase` to the HTX's officers and managers |
| `notification.households` | `{ template: "dry_soil" \| "heat" \| "frost" \| "rain_after_spray" \| "disease_nearby", slots, subjects, note_vi? }` | medium · manager · 24 h | one notification per household account of the parcels in `slots.parcel_codes`; a code outside the HTX refuses the whole action |
| `disease.inspection` | `{ disease, report_ids: string[2..50] sorted, parcel_codes: string[1..50], radius_m (100–20000), days (1–30) }` | medium · officer, manager · 72 h | notification to officers and managers, deep link `/officer/diseases` |
| `harvest.approve` | `{ parcel_id }` | high · manager · 24 h | `TenantGuard`, then `ApproveHarvestUseCase` (checks the withdrawal period again) |
| `bulletin.publish` | `{ commodity, period_day (YYYY-MM-DD), bulletin_vi: 50–4000 characters, sources: [{ source, metric, value, unit, period }] }` | medium · manager · 24 h | `PublishBulletinUseCase`: a published row of the HTX, earlier latest rows of the commodity cleared |

  - Message templates (`notification.*`): the agent sends the template id and typed slots only; the web renders the Vietnamese title and body (for example `dry_soil`: "Đất khô"). Any `body`, free text, or an unknown template is `INVALID_PAYLOAD`.
  - **400** `VALIDATION_ERROR` — invalid body, `UNKNOWN_KIND`, `INVALID_ORIGIN`, `INVALID_PAYLOAD`, `INVALID_EVIDENCE`, `INVALID_EVIDENCE_TABLE`, `EVIDENCE_NOT_IN_HTX`, `SUBJECT_NOT_IN_EVIDENCE`, `TOO_MANY_EVIDENCE_ROWS` (over 50), `PAYLOAD_TOO_LARGE`, `INVALID_REASON`, or `INVALID_RUN_ID` (`run_id` missing or owned by another HTX).
- **`POST /api/internal/agent/llm/v1/chat/completions`** *(M1c, APISIX `:9081` -> `ollama:11434/v1/chat/completions`)* — dedicated Ollama completion route for `dxos-agent` with separate `30 req / 60s` rate limit per agent bearer token (`429` triggers `>= 60s` backoff inside `OllamaProvider`).

| HTTP | code | When |
|------|------|------|
| 400 | VALIDATION_ERROR | Invalid path UUID, JSON body, catalogue payload/evidence/reason, or foreign `run_id` |
| 401 | UNAUTHORIZED | Missing/malformed bearer token, bad signature, expired `exp`/`nbf`, wrong `iss`/`aud`, or unknown JWKS `kid` |
| 403 | FORBIDDEN | Missing/mismatched `X-Dxos-Gateway` (`INTERNAL_GATEWAY_REQUIRED`), missing `agent` role, missing `htx_code`, or `azp` mismatch |
| 404 | NOT_FOUND | Run `id` does not exist for the caller's HTX |

### `GET /api/agent/proposals`
List agent proposals for the caller's HTX (`manager` or `officer` only; `farmer` returns 403).

- **Query:** `?view=open|history&kind=<optional>` (default `open`, limit 100).
- **open** lists only `proposed` rows that have not passed `expires_at`. Each request first fails `approved` rows with no `executed_at` that were decided more than 10 minutes ago, with error `interrupted` and an audit event.
- **200** `{ "data": ProposalInboxItem[] }` — each item carries `payload`, `titleVi`, `preview` lines, `canDecide` (`role ∈ approverRoles`), `editableFields` (the fields "Sửa rồi duyệt" may change), and `subjects` (`[{ id, label }]`, loaded in one query scoped to the caller's HTX for `journal.*` entries).

### `POST /api/agent/proposals/[id]/decision`
Approve or reject an open proposal (`manager` or `officer` with matching `approverRoles`).

- **Request:** `{ "decision": "approve" | "reject", "note"?: string (1–500 required for reject), "edited_payload"?: Record<string, unknown> }` (approve only; edits restricted to `editableFields`).
- **200** `{ "data": { "outcome": "executed" | "rejected" | "failed" | "stale" | "expired" | "already_decided", ... } }`. `failed` carries `error`: the domain message when the action raised one, otherwise a generic Vietnamese message (the detail is logged). `executed` is answered even when recording the execution fails afterwards (logged).
- **403** `FORBIDDEN` — caller role cannot approve this action kind.
- **404** `NOT_FOUND` — proposal not found in caller's HTX.
- **409** `PROPOSAL_STALE` | `PROPOSAL_EXPIRED` | `ALREADY_DECIDED` — source rows changed, expired, or concurrently decided. A stale or expired mark that changes no row answers `ALREADY_DECIDED` with who decided and when.
- **Journal actions** return `422 DOMAIN_ERROR` when the journal refuses the change. A batch that approves nothing is a domain error that names the failed entry ids.

#### Evidence canonical JSON format
For cross-language SHA-256 verification between TypeScript and Python (`dxos-agent` in M1c):
- Object keys sorted lexicographically recursively, no whitespace, arrays preserve order, `undefined` object properties dropped. Only integers, booleans, strings and null are allowed: any non-integer number is rejected.
- Contract version 2 (`platform/agent/tests/fixtures/evidence-vectors.json`): `journal_entries` values are `{ id, parcel_id, status, entry_date, activity_type, notes, updated_at, activities: [{ id, activity_detail, product_name, dosage, withdrawal_days, safe_harvest_date }] }` with activities sorted by `id` in plain code-point order; `parcel_crop_cycles` values are `{ id, parcel_id, season, sowed_at, estimated_harvest_date, harvested_at }`. Timestamps are UTC `YYYY-MM-DDTHH:MM:SS.mmmZ`; a value without an offset is UTC. Missing values are `null`.
- Staleness is checked at decision time: every evidence row is re-hashed from the current record of the caller's HTX; a missing row is stale.
- Equivalent Python call: `json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False)`.
- Fixed vector: `{"b": 1, "a": [{"d": "é", "c": null}]}` → `{"a":[{"c":null,"d":"é"}],"b":1}` → SHA-256 `2d39a9eff5fc38971ac13f9187b86e18b6531fd0fe2c17e45a200a5948144ae7`.

### `POST /api/journal/[id]/review`
Reject or request changes on a `PENDING_APPROVAL` journal entry (`officer` or `manager`, tenant-guarded).

- **Request:** `{ "decision": "REJECTED" | "REQUEST_CHANGES", "reason": string (trimmed, 1–500) }`.
- **200** `{ "data": { "status": "REJECTED" | "REQUEST_CHANGES" } }` — stores `review_note` and notifies the submitting farmer if `submitted_role = FARMER`.
- **400** `VALIDATION_ERROR` — invalid body or entry no longer `PENDING_APPROVAL`.
- **403** `FORBIDDEN` / **404** `NOT_FOUND` — wrong role or foreign HTX.

---


## Chiến dịch hôm nay (M7)

Mỗi sáng agent A9 (`daily-campaign`, 06:00 giờ Việt Nam) gom các đề xuất đang mở của HTX thành một chiến dịch: tối đa 15 việc, mỗi việc có mục tiêu đo được. Quy tắc thứ tự và xung đột (mưa, thời gian cách ly, số người) nằm ở agent; web lưu chiến dịch sau khi kiểm tra lại, và là nơi duy nhất ghi quyết định. Mỗi HTX chỉ có một chiến dịch cho mỗi ngày.

### Nội bộ (token agent)

- **`GET /api/internal/agent/campaigns/candidates?day=YYYY-MM-DD`**: trả về `{ day, proposals, rain_parcel_codes, withdrawal_parcel_codes, people_available }`. `proposals` là đề xuất `proposed` chưa hết hạn, mỗi mục có `id`, `kind`, `risk`, `title_vi`, `created_at`, `parcel_codes`, `goal_key`, `target`, `involves_spraying` (luôn `false`), `people_needed` (1 cho `staff.task.create`, 2 cho `harvest.approve` có sản lượng ước tính trên 500 kg, còn lại `0`). `rain_parcel_codes` là thửa có dự báo từ 5 mm mưa; `withdrawal_parcel_codes` là thửa còn trong thời gian cách ly phun thuốc của ngày đó. `people_available` là số người có mặt hôm nay do app nhân sự báo (`platform.staff_attendance`), hoặc `null` khi chưa có báo cáo; khi đó quy tắc người của A9 bị bỏ qua. `season_goal_keys` (M11) là các `goal_key` của chiến dịch mà kế hoạch mùa vụ đang áp dụng đề cao (`harvest`, `inspection`, `journal_backlog`); rỗng khi quý chưa có kế hoạch.
- **`POST /api/internal/agent/campaigns`**: `{ day, items: [{ proposal_id, position }], dropped: [{ proposal_id, rule }], summary_vi, run_id }`. `position` phải là 1..n theo thứ tự; `rule` là `withdrawal`, `rain`, `people` hoặc `overflow`. Web tính lại `goal_key` và `target` từ đề xuất, không tin giá trị agent gửi. `201 { id }` khi tạo mới; `200 { existing: true, id }` khi HTX đã có chiến dịch của ngày đó (không gửi Telegram lần nữa). `400 INVALID_CAMPAIGN` khi một đề xuất không còn `proposed` hoặc không thuộc HTX; `400 INVALID_RUN_ID` khi `run_id` không thuộc HTX. Danh sách `dropped` chỉ ghi vào sự kiện kiểm toán `agent.campaign.created`.

### Kế hoạch mùa vụ (M11, nội bộ, token agent)

- **`GET /api/internal/agent/strategy/inputs?season=YYYY-Qn`**: `{ data: { season, current, last_year, previous, adopted, draft_exists } }`.
  - `current`, `last_year` (cùng quý năm trước), `previous` (quý trước): `{ yield_kg, journal_on_time_rate, diseased_parcel_rate, shop_revenue_vnd }`, mỗi số liệu là số hoặc `null` khi không có dòng nào. `shop_revenue_vnd` là `null` khi `tea-shop` chưa cài hoặc chưa bật cho HTX.
  - `adopted`: `{ id, season }` của kế hoạch đã áp dụng cho quý đó, hoặc `null`. `draft_exists`: quý đã có bản nháp.
  - `400` khi `season` không phải `YYYY-Qn`.
- **`POST /api/internal/agent/strategy/plans`**: `{ season, goals: [{ key, target }], priorities, initiatives: [{ kind, title_vi }], run_id? }`.
  - Tối đa 5 `priorities` (mỗi mục tối đa 160 ký tự) và 5 `initiatives` (`kind` ∈ `miniapp|training|partner|expand|outside`); `goals` không lặp `key`.
  - Web đặt nhãn, đơn vị, hướng và `baseline` của mục tiêu từ số liệu cùng quý năm trước; mục tiêu không có số liệu năm trước bị từ chối (`400 INVALID_GOAL`).
  - `warnings` do web tính lại: mỗi mục tiêu tệ hơn cùng kỳ (thấp hơn với `up`, cao hơn với `down`) thêm `Mục tiêu <nhãn> thấp hơn cùng kỳ năm trước`.
  - `201 { data: { id, proposal_id } }` và tạo đề xuất `strategy.adopt` (agent `strategy`, payload `{ plan_id }`). `200 { data: { existing: true } }` khi quý đã có bản nháp.
- **`strategy.adopt`** (danh mục): rủi ro `medium`, người duyệt `manager`, `autonomy: unlockable`, cửa sổ chặn 48 giờ khi tự vận hành. Áp dụng kế hoạch (`adopted`) và chuyển kế hoạch đã áp dụng trước của cùng quý sang `superseded` trong một giao dịch; ghi sự kiện kiểm toán `strategy.adopted`. Kế hoạch có `warnings` không bao giờ đủ điều kiện tự chạy (lý do `rule_warning`).
- Báo cáo tuần thứ Hai thêm tối đa 3 dòng `<nhãn>: <hiện tại> (cùng kỳ năm trước: <baseline>)` từ kế hoạch đã áp dụng, không nhắc tới mục tiêu.

### Web (quản lý và cán bộ)

- **`GET /api/agent/campaigns/today`**: `{ campaign: null }` hoặc `{ campaign: { id, day, status, summaryVi, decidedByName, items: [{ position, proposalId, kind, titleVi, status, risk, goalLine }] } }`. `status` là `draft`, `approved`, `partial`, `done` hoặc `dropped`.
- **`POST /api/agent/campaigns/[id]/decision`** với `{ "decision": "approve_all" | "drop" }`:
  - `approve_all` chạy từng việc qua `DecideProposalUseCase` mà người duyệt có quyền; việc `high` chờ xác nhận riêng; việc của vai trò khác được chuyển cho người có quyền. Trả về `{ data: { executed, waitingHigh, forwarded, failed, alreadyDecided } }`.
  - `drop` bỏ chiến dịch; các việc trở lại thành đề xuất thường. Trả về `{ data: { dropped: true } }`.
  - `409 CAMPAIGN_CLOSED` khi chiến dịch không còn `draft` hoặc `partial`.
  - Một việc được duyệt riêng từ hộp thư khi chiến dịch còn `draft` sẽ chuyển chiến dịch sang `partial`.

### Telegram

- Tin chiến dịch gửi cho quản lý liên kết, với nút `A` (Duyệt cả chiến dịch), `L` (Xem từng mục) và `D` (Bỏ chiến dịch). Nút `A` và `D` sửa chính tin đó thành dòng kết quả, không còn nút. Nút `L` gửi lại tin đề xuất của từng việc chưa quyết định.
- `/chiendich` trong chat riêng gửi chiến dịch hôm nay cho quản lý hoặc cán bộ, hoặc trả lời `Hôm nay chưa có chiến dịch.`.
- Báo cáo 18:00 (`daily`) có thêm dòng `Chiến dịch hôm nay: <việc xong>/<việc> việc xong`, tối đa ba dòng mục tiêu `• <nhãn>: <đạt>/<mục tiêu> <đơn vị>` và `Chưa xong: <k> việc`. Khi mọi việc đã quyết định, chiến dịch chuyển sang `done`.

## Cải tiến hằng tuần (M8)

Mỗi thứ Hai 06:30 (giờ Việt Nam) agent A10 (`improvement`) xem số liệu tuần trước và đề xuất tối đa năm cải tiến. Mỗi cải tiến là một đề xuất thường (`agent.settings.update` cho đổi ngưỡng hoặc giờ báo cáo, `improvement.adopt` cho ghi chú quy trình hoặc mẫu nhắc của chiến dịch), nên duyệt, Telegram, chiến dịch và kiểm toán dùng lại luồng M1 đến M7. Trạng thái cải tiến đi theo đề xuất: đề xuất được duyệt và thực hiện thì `adopted`, bị từ chối thì `declined`.

`agent.settings.update` chỉ đổi các khóa trong payload, trong khoảng cho phép của agent (ví dụ `field-watch.silent_hours` 1..48, `digest.schedule` 05:00..22:00). Bản xem trước ghi rõ `(siết)` hoặc `(nới)` cho từng thay đổi, và khóa `SETTING_KEYS` trong `agent-settings-update.action.ts` cho M12 biết chiều của mỗi khóa.

Các route nội bộ dùng token agent, không có phiên trình duyệt. Mọi phản hồi nằm trong `data`.

### Nội bộ (token agent)

- **`GET /api/internal/agent/improvements/inputs?week=YYYY-MM-DD`** (thứ Hai): trả về `{ data: { week, settings, proposal_stats, journal_review, campaign_goals, improvements, metrics, season_progress } }`.
  - `settings`: ngưỡng và giờ báo cáo của từng agent có dòng cài đặt.
  - `proposal_stats`: đề xuất đã quyết định trong 28 ngày, nhóm theo `agent`, `kind`, `template`, với `approved`, `rejected`, `expired`, `median_wait_hours`.
  - `journal_review`: `reviewed` và `returned_missing_info` trong 28 ngày.
  - `campaign_goals`: số ngày và số ngày trượt mục tiêu trong 14 ngày gần nhất (`actual < target`).
  - `improvements`: cải tiến của 8 tuần gần nhất.
  - `metrics`: giá trị hiện tại của từng `metric_key` trong `improvements`; khóa không có số liệu không có giá trị. Khóa `season_goal:<key>` (M11) có giá trị là số liệu hiện tại của mục tiêu vụ đó.
  - `season_progress` (M11): mỗi mục tiêu của kế hoạch mùa vụ đã áp dụng cho quý hiện tại: `{ key, label_vi, direction, baseline, target, current, pro_rated_target, weeks_elapsed }`. `pro_rated_target` là mục tiêu nhân tỉ lệ quý đã qua với sản lượng và doanh thu (cộng dồn), và là chính mục tiêu với tỉ lệ. Rỗng khi không có kế hoạch.
- **`POST /api/internal/agent/improvements`**: `{ week, kind, metric_key, title_vi, rationale_vi, baseline, evidence, settings_change?, template?, run_id? }`.
  - `kind` là `setting` (cần `settings_change`), `process` hoặc `template` (cần `template`).
  - `week` phải là thứ Hai; `title_vi` tối đa 120 ký tự, `rationale_vi` tối đa 600.
  - `201 { data: { id, proposal_id } }` khi tạo mới. `200 { data: { deduped: true } }` khi đã có cải tiến cùng tuần và `metric_key`, hoặc đề xuất bị chặn vì vừa có đề xuất tương tự.
  - `400 VALIDATION_ERROR` khi khóa hoặc khoảng giá trị nằm ngoài hợp đồng C2. Cải tiến không được lưu trong trường hợp này.
- **`POST /api/internal/agent/improvements/{id}/effect`**: `{ after: "2w" | "4w", value, verdict: "helped" | "no_effect" | "drop" }`. `after: "4w"` đặt trạng thái `measured`.
  - `200 { data: { id, after } }`.
  - `404 NOT_FOUND` khi cải tiến không thuộc HTX.
  - `409 CONFLICT` khi cải tiến chưa `adopted` hoặc mốc `after` đã có số đo.

### Telegram (M8)

- Báo cáo tuần (`weekly`) có thêm tối đa ba dòng sau các số liệu: `Cải tiến tuần này: <n> đề xuất` khi có đề xuất mới trong tuần, và một dòng cho mỗi cải tiến được đo trong 7 ngày gần nhất: `Đã giúp: <tiêu đề>`, `Chưa thấy tác dụng: <tiêu đề>` hoặc `Nên bỏ: <tiêu đề>`.
- Tin chiến dịch 06:00 và khung chiến dịch trong hộp thư có thêm dòng `Nhắc theo mẫu: <tiêu đề>` cho mẫu đã áp dụng đúng thứ trong tuần của chiến dịch (thứ Hai = 1). Tối đa hai dòng.

### Hộp thư (quản lý và cán bộ)

- **`GET /api/agent/campaigns/today`**: đối tượng `campaign` có thêm `reminders: string[]` (các dòng `Nhắc theo mẫu:`). Các trường khác không đổi.

## Tự vận hành (M12)

### Nội bộ (token agent)

- **`POST /api/internal/agent/autopilot/tick`**: không có thân. `dxos-agent` gọi mỗi vòng chính cho từng HTX có thông tin xác thực; web chỉ xử lý HTX của token. Trả `{ data: { ran, failed, returned, stopped } }` với `stopped` là một trong `enabler_lost|inactive|brake_failures|brake_cap|brake_blocks|brake_volume` hoặc `null`. Khi chế độ tắt, lệnh gọi không làm gì. Mỗi lần tick kiểm tra lại mọi điều kiện: người bật còn là trưởng HTX và chưa bị khóa, 7 ngày có thao tác của quản lý, các phanh (3 lỗi trong 1 giờ, đủ hạn mức ngày, hơn 30% bị chặn khi có từ 5 quyết định, một agent vượt 3 lần mức trung bình 14 ngày), rồi nhận tối đa 20 đề xuất đến giờ và chạy qua `DecideProposalUseCase` với vai trò `manager` của người bật, kênh `autopilot`. Một nông hộ đã nhận 2 tin tự động trong ngày thì đề xuất `notification.households` quay về chờ duyệt.
- Đề xuất tạo qua `POST /api/internal/agent/proposals` nay lưu thêm `shadow_auto` và, khi chế độ bật và đề xuất đủ điều kiện, `run_at` = giờ tạo + cửa sổ theo rủi ro (`low` 0, `medium` 15 phút, `high` 2 giờ). Câu trả lời không đổi.

### Web (quản lý và cán bộ)

- **`GET /api/agent/autopilot`** (quản lý, cán bộ): `{ data: { enabled, enabled_by_name, enabled_at, stopped_at, stop_reason, daily_cap, unlocked_kinds, kinds, today: { ran, blocked, pending }, can_enable } }`. Mỗi phần tử của `kinds` có `kind`, `title_vi`, `autonomy` (`auto|unlockable|never`), `risk`, `window_minutes`, `match_rate` (0..1 hoặc `null` khi chưa có mẫu), `sample`, `warning` (đúng khi `match_rate` dưới 0,9) và `unlocked`. Tỉ lệ khớp tính trên 30 ngày: đề xuất `origin: agent` đã được người quyết định (không tính hết hạn, hết hiệu lực và các quyết định của chính chế độ tự vận hành) mà `shadow_auto` bằng việc đề xuất có được duyệt hay không. Một yêu cầu của quản lý cập nhật `last_manager_activity_at` (tối đa một lần mỗi phút).
- **`POST /api/agent/autopilot/enable`** (chỉ quản lý) với `{ "unlocked_kinds": string[], "daily_cap": 1..50, "acknowledged": true }`. `401 REAUTH_REQUIRED` khi `auth_time` của phiên (claim của Keycloak, giây) cũ hơn 5 phút hoặc không có; giao diện khi đó gọi `signIn('keycloak', { callbackUrl }, { prompt: 'login' })`. `400` khi chưa xác nhận, `daily_cap` ngoài 1..50, hoặc một loại không phải `unlockable`. Ghi sự kiện kiểm toán `autopilot.enabled` kèm ảnh chụp màn hình bật, gửi tin Telegram tới mọi quản lý và cán bộ đã liên kết. Trả về cùng dạng với `GET`.
- **`POST /api/agent/autopilot/stop`** (quản lý, cán bộ): dừng với lý do `manual`; trả về cùng dạng với `GET` cùng `returned` (số cửa sổ đã trả về chờ duyệt) và `was_on`.
- Phiên có thêm `authTime` (giây kể từ epoch): claim `auth_time` của ID token Keycloak lúc đăng nhập, giữ nguyên khi làm mới token.

### Telegram (M12)

- Nút của tin `Sẽ tự chạy lúc <HH:mm>: …` dùng callback v1 với thao tác `b` (Chặn) và `v` (Xem). Chặn trước giờ chạy: `blocked_by`, `blocked_at`, `run_at = NULL`, đề xuất vẫn `proposed`. Chặn sau khi tick đã nhận hoặc đã chạy trả lời `Đã chạy, không chặn được nữa.`. Chặn khi đề xuất không còn cửa sổ trả lời `Việc này không còn chờ tự chạy.`.
- `/dung` (trưởng HTX hoặc cán bộ, trò chuyện riêng) dừng chế độ với lý do `manual`: `Đã dừng tự vận hành. Các việc đang chờ chuyển về chờ duyệt.`; khi chế độ đã tắt: `Tự vận hành đang tắt.`. `/tuvanhanh` hiện trạng thái và số liệu hôm nay.
- Tin được sửa thành `AI đã tự thực hiện lúc <HH:mm>.` sau khi chạy. Tin chiến dịch 06:00 bắt đầu bằng `Chiến dịch hôm nay sẽ tự chạy` khi chế độ bật, kèm giờ chạy của từng việc có `run_at`. Báo cáo 18:00 thêm dòng `Tự vận hành: <n> việc đã tự chạy, <n> bị chặn, <n> lần phanh, chi phí <usd> USD` khi chế độ bật trong ngày.

## Telegram base (M2)

Telegram is optional. It is active only when `TELEGRAM_BOT_USERNAME` and `DXOS_TELEGRAM_CALLBACK_KEY` are set on the web; without them no message is queued and the rest of the web works as before. The relay `dxos-telegram` long-polls the Bot API and calls the internal routes below through APISIX `:9081`; every decision is made here. Messages are plain text, at most 4096 characters, with no personal data (parcel codes, counts and dates only).

### Internal Telegram API (`dxos-telegram` client, realm role `telegram`)

Bearer token of client `dxos-telegram` plus the gateway header (`X-Dxos-Gateway`); the agent verifier refuses these tokens and this verifier refuses agent tokens. Responses are `{ "data": ... }` or `{ "error": { "code", "message" } }`.

- **`POST /api/internal/telegram/updates`**: forwards one update, stripped to `update_id`, `message` (`message_id`, `chat`, `from`, `text`) and `callback_query` (`id`, `from`, `message.chat`, `data`). Answer: `{ "replies": [OutboxMessage], "answer_callback"?: { "text", "show_alert" } }`. Idempotent per `update_id`: a repeat returns no replies. A failure forgets the `update_id` so the relay can retry.
  - `/start <code>` (private): consumes a user link code (single use, 10 minutes, stored as SHA-256) and links the Telegram account.
  - `/stop`: unlinks the account. `/huy`: cancels a pending rejection reason.
  - `/nhom <code>` (group or supergroup): links the cooperative's group, which receives reports only.
  - Callbacks: `callback_data` is checked against the HMAC of `DXOS_TELEGRAM_CALLBACK_KEY`; callbacks from groups are refused; the account must be linked; the role, enabled flag and `htx_code` are read live from Keycloak (`dxos-web-roles`) at tap time; the proposal must belong to the account's cooperative; the decision then goes through `DecideProposalUseCase` with channel `telegram`.
  - Reject: the button asks for a reason; the next private text within 10 minutes is the reason (500 characters at most).
- **`GET /api/internal/telegram/outbox?limit=20`** (limit 1–50): leases up to `limit` due messages for 60 seconds and returns `{ "data": [{ "id", "op", "chat_id", "text", "buttons"?, "edit_message_id"? }] }`. Also runs the health checks at most once a minute.
- **`POST /api/internal/telegram/outbox/{id}/result`**: `{ "ok": true, "telegram_message_id"? }` or `{ "ok": false, "error", "retry_after_seconds"?, "permanent"? }`. A failure is retried with backoff (`retry_after_seconds` when given, otherwise 5 s doubling up to 15 min, 10 attempts). An edit answered with "message is not modified" counts as sent.
- **`POST /api/internal/telegram/heartbeat`**: `{ "version"? }`, every minute from the relay.

`OutboxMessage`: `{ "op": "send" | "edit", "chat_id", "text", "buttons"?: [[{ "text", "callback_data" } | { "text", "url" }]], "edit_message_id"? }`. `callback_data` is `v1|<proposal id, base64url>|<a|r>|<HMAC prefix>`.

### Agent reports and heartbeat (agent token)

- **`POST /api/internal/agent/reports`**: `{ "kind": "daily" | "weekly", "period_start": "YYYY-MM-DD", "period_end": "YYYY-MM-DD", "figures": { "journals_new"?, "journals_approved"?, "journals_pending"?, "disease_reports"?, "lots_created"? } }`. The web counts `proposals_open` and `proposals_decided` itself and ignores any other figure. Recorded once per `(cooperative, kind, period_start)`; the answer is `201 { "queued": true }` when new and `200 { "queued": false }` when already recorded. Sent to the cooperative's managers and officers and to its group.
- **`POST /api/internal/agent/heartbeat`**: `{ "version"?, "providers"?: ("ollama" | "anthropic" | "openai")[] }`, every 5 minutes per enabled cooperative. `providers` lists the providers whose key the agent container holds; it is stored in `service_heartbeats.details` and decides which providers the settings tab offers. Omitting it keeps the stored list. The health check raises a stale-agent alert only for cooperatives with the agent enabled (10 minutes without a heartbeat). Health messages go to managers, at most once per condition every six hours.

### User routes (session)

- **`GET /api/telegram/status`** (manager, officer, farmer): `{ "configured", "linked", "linked_at", "group_linked", "agent_stale", "telegram_stale" }`. `group_linked` is meaningful for managers only.
- **`POST /api/telegram/link`**: creates a single-use link code and returns `{ "url": "https://t.me/<bot>?start=<code>", "expires_at" }` (201). `409 TELEGRAM_NOT_CONFIGURED` when Telegram is off.
- **`DELETE /api/telegram/link`**: unlinks the caller's Telegram account.
- **`POST /api/telegram/group-link`** (manager only): `{ "command": "/nhom <code>", "expires_at" }` (201).

## MCP cho client bên ngoài (M14)

Route `/api/mcp/*` nhận `Authorization: Bearer <access token>` của chính người dùng. Token phát hành cho client Keycloak `dxos-mcp` (realm `agrimarket`, device grant). Không dùng session và không cần header `X-Dxos-Gateway`. Vai trò, HTX và trạng thái bật/tắt được đọc trực tiếp từ Keycloak ở mỗi lượt gọi, giống Telegram. Client chỉ có đúng quyền của người dùng đó.

### `GET /api/mcp/tools`
Trả `{ "tools": [{ "name", "title_vi", "description_vi", "input_schema" }] }`. Mỗi công cụ đọc của chat chỉ hiện với vai trò được phép; `input_schema` là JSON Schema của đối số. `create_proposal` chỉ hiện với quản lý và cán bộ.

**Lỗi:** `401 UNAUTHORIZED` khi thiếu, hết hạn hoặc là token của client khác; `403 FORBIDDEN` khi người dùng bị tắt hoặc không còn vai trò; `503 CORE_UNAVAILABLE` khi không đọc được Keycloak.

### `POST /api/mcp/tools/[name]`
Body: `{ "arguments": { ... } }`.

- **Công cụ đọc:** `200 { "text": "<tối đa 7 dòng>\nNguồn: <nguồn>" }`, cùng định dạng với Telegram. `403` khi vai trò không được dùng công cụ, `404` khi tên không tồn tại.
- **`create_proposal`:** `arguments` là `{ kind, payload, reason_vi }` với `reason_vi` 1 đến 500 ký tự. Chỉ tạo đề xuất, không thực hiện gì: đề xuất ở trạng thái `proposed` cho đến khi người có quyền duyệt qua `DecideProposalUseCase`. Đề xuất có `origin: 'user'`, `requested_by` là người dùng, `agent: 'mcp'`, bằng chứng do web tự dựng từ các đối tượng trong payload, và được gửi tới Telegram như đề xuất thường. `201 { "proposal_id", "status": "proposed", "message_vi" }`.
  - `400 VALIDATION_ERROR` với message `INVALID_ORIGIN`, `UNKNOWN_KIND`, `INVALID_PAYLOAD` hoặc `EVIDENCE_NOT_IN_HTX` (đối tượng ngoài HTX).
  - `403 FORBIDDEN` với message `NOT_AN_APPROVER` khi vai trò không duyệt được loại đề xuất đó.
  - `409 CONFLICT` khi đã có đề xuất đang mở cho cùng đối tượng.
  - Sự kiện kiểm toán `agent.proposal.created` có `origin: 'user'` và `channel: 'mcp'`.

## Dòng kiểm chứng AI trên trang truy xuất (M14)

Trang công khai `/lot/[lot_code]` hiện khối "kiểm chứng trong sổ audit" chỉ khi quyết định AI của lô có đủ ba điều kiện: sự kiện duyệt `agent.proposal.approved` tồn tại, mã băm bằng chứng của sự kiện bằng mã băm của đề xuất, và `audit.verify_chain()` không báo dòng hỏng tới sự kiện đó. Mỗi lô tối đa 3 dòng, dạng `AI đề xuất, <cán bộ|trưởng HTX> đã duyệt ngày <dd/MM/yyyy>, kiểm chứng trong sổ audit`. Trang không bao giờ hiện tên người duyệt. Dòng được tính khi tải trang, không nằm trong ảnh chụp `public_page_data` của lô đã xuất QR.

## Giao việc cho nhân sự (M10)

Mỗi sáng 05:50 (giờ Việt Nam) agent A8 (`staff-tasks`, không dùng LLM) đề xuất việc cho nhân sự từ những gì các agent khác đã làm. Đề xuất `staff.task.create` (rủi ro `medium`, người duyệt `manager`, web và Telegram) có `title_vi` (1..120), `note_vi` (tối đa 500, chỉ người thêm), `parcel_id?`, `due_date` (YYYY-MM-DD), `assignee_ref` (bắt buộc, 1..64, sửa được) và `source: {kind, proposal_id?}`. Khi duyệt, đề xuất chuyển sang `sent_to_staff_app` (hộp thư và Telegram ghi `Đã gửi app nhân sự`), kết quả `{ state: "waiting_for_staff_app" }`. Lúc duyệt web kiểm tra lại `assignee_ref` còn là dòng đang làm trong bảng nhân sự của HTX; nếu không, đề xuất `failed` với `Người nhận việc không còn trong danh sách nhân sự đang làm. Chọn người khác rồi duyệt lại.` Khi app nhân sự báo đã tạo việc, đề xuất thành `executed` với `external_ref` là mã việc.

App nhân sự không bao giờ được core gọi tới: nó tự kéo mỗi phút. Mọi route dưới đây đi qua cổng nội bộ với token `dxos-staff-<htx>` (vai trò `staff-sync`, claim `htx_code`), và chỉ thấy dữ liệu của HTX trong token. Phản hồi nằm trong `data`.

### Nội bộ (token app nhân sự)

- **`GET /api/internal/staff/tasks`**: `{ data: { tasks: [{ proposal_id, title_vi, note_vi, parcel_code, due_date, assignee_ref, approved_by_name, approved_at }] } }`. Chỉ các đề xuất `staff.task.create` đang `sent_to_staff_app`, chưa hết hạn, của HTX trong token (HTX khác nhận danh sách rỗng). Giá trị là bản người duyệt đã sửa. `note_vi`, `parcel_code` có thể là `null`.
- **`POST /api/internal/staff/tasks/{proposal_id}/ack`** với `{ task_id }` (1..100 ký tự): `200 { data: { proposal_id, task_id, already } }`; đề xuất thành `executed`, `external_ref = task_id`. Gửi lại cùng `task_id` vẫn `200` với `already: true`. `404` cho HTX khác, id lạ hoặc id không phải uuid; `409 PROPOSAL_NOT_AWAITING_STAFF_APP` khi không còn `sent_to_staff_app` (đã hết hạn, hoặc đã báo mã việc khác); `400` khi thiếu `task_id`.
- **`PUT /api/internal/staff/roster`** với `{ staff: [{ staff_ref, name, department?, active }] }`, tối đa 500, `staff_ref` không trùng, không nhận trường lạ (không có số điện thoại hay lương). Thay toàn bộ danh sách của HTX: dòng không còn trong danh sách trở thành không hoạt động. `200 { data: { staff: n } }`.
- **`PUT /api/internal/staff/attendance`** với `{ day, present }`, chỉ cho hôm nay theo giờ Việt Nam (ngày khác `400 ATTENDANCE_DAY_NOT_TODAY`); `present` là số nguyên 0..100000. Ghi đè số của ngày đó. `200 { data: { day, present } }`.

### Nội bộ (token agent)

- **`GET /api/internal/agent/staff/inputs`**: `{ data: { proposals, roster, attendance } }` cho A8. `proposals` là đề xuất `executed` trong 24 giờ qua thuộc `harvest.approve`, `disease.inspection` hoặc `notification.households` với mẫu `dry_soil` hoặc `rain_after_spray`, mỗi mục `{ id, kind, template, parcels: [{ id, code }] }` (`template` là `null` với loại không có mẫu). `roster` là nhân sự đang làm `{ staff_ref, name, department, active }`. `attendance` là `{ day, present }` của hôm nay hoặc `null` khi app nhân sự chưa báo.

## Lứa hái, danh mục thuốc và nhật ký (GĐ1 S1)

Mọi route dưới đây trả `{ "data": ... }` khi thành công và `{ "error": { "code", "message" } }` khi lỗi. Hai quy tắc ngày và mức sàn cách ly: [rules-and-limits.md](./rules-and-limits.md) mục 3.2.

### `GET /api/pesticides`
Danh mục thuốc BVTV đang dùng, kèm mức sàn hiệu lực của HTX trong phiên. **Vai:** `manager`, `officer`, `farmer`.

**Query:** `q` (tối đa 100 ký tự; tìm trong tên thương mại và hoạt chất, không phân biệt hoa thường), `target` (tối đa 100 ký tự; lọc theo đối tượng phòng trừ). Cả hai tuỳ chọn. Với `farmer`, thuốc HTX đã ứng cho hộ trong 180 ngày qua (qua `input_items.pesticide_product_id`, ứng gần nhất trước) xếp đầu, rồi thuốc hộ đã dùng trong 365 ngày qua (dùng gần nhất trước), còn lại theo tên.

**Response:**
```json
{
  "data": [
    {
      "id": "cuid",
      "trade_name": "Minup 0.3EC",
      "active_ingredient": "Azadirachtin",
      "group": "BOTANICAL",
      "targets": ["Rầy xanh", "Bọ cánh tơ"],
      "default_phi_days": 7,
      "floor_days": 7,
      "label": null,
      "needs_label_check": true
    }
  ]
}
```
`group` là `BOTANICAL`, `MICROBIAL`, `BIOLOGICAL`, `CHEMICAL` hoặc `ANTIBIOTIC`. `floor_days` là `label.label_phi_days` nếu HTX đã đặt nhãn, nếu không là `default_phi_days`. `label` là `{ label_phi_days, label_note, verified_at }` hoặc `null`. `needs_label_check` đúng khi HTX chưa đặt nhãn và dòng danh mục còn cờ đối chiếu nhãn.

**Errors:** 401 `UNAUTHORIZED`; 403 `FORBIDDEN` (vai khác) hoặc `NO_HTX`; 400 `VALIDATION_ERROR` (tham số quá dài).

### `PUT /api/pesticides/[id]/label`
Đặt hoặc cập nhật nhãn của HTX cho một thuốc. **Vai:** `officer`, `manager`.

**Request:**
```json
{ "label_phi_days": 10, "label_note": "Lô 2611A, nhãn ghi 10 ngày" }
```
`label_phi_days` là số nguyên từ 1 đến 365. `label_note` tuỳ chọn, tối đa 200 ký tự, nhưng bắt buộc khi `label_phi_days` thấp hơn `default_phi_days` của thuốc.

**Response:** `{ "data": <một dòng như GET /api/pesticides> }`.

**Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND` (không có thuốc đó trong danh mục); 422 `DOMAIN_ERROR` ("Thấp hơn mức sàn mặc định N ngày: cần ghi chú số lô hoặc nội dung nhãn.").

### `DELETE /api/pesticides/[id]/label`
Xoá nhãn của HTX; mức sàn quay về `default_phi_days`. **Vai:** `officer`, `manager`. **Response:** `{ "data": <dòng thuốc không còn nhãn> }`. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `PUT /api/platform/pesticides/[id]`
Sửa danh mục thuốc chung sau khi đối chiếu nhãn. **Vai:** `platform_admin`.

**Request:**
```json
{ "default_phi_days": 14, "phi_needs_label_check": false, "active": true }
```
Cả ba trường bắt buộc; `default_phi_days` từ 1 đến 365. **Response:** `{ "data": <dòng pesticide_products> }`. **Errors:** 400 `VALIDATION_ERROR`; 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `POST /api/journal` (thay đổi GĐ1)
**Vai:** `officer`, `farmer`. Mỗi phần tử của `activities` nhận thêm:

| Trường | Ghi chú |
|--------|---------|
| `activity_type` | thêm `PRUNING` (Đốn chè); các giá trị: `SOWING`, `FERTILIZING`, `SPRAYING`, `IRRIGATION`, `HARVEST`, `PRUNING`, `OTHER` |
| `pesticide_product_id` | tuỳ chọn; mã thuốc trong danh mục. Không có thì lần phun là "Thuốc khác" (hoặc khớp theo `product_name` trùng tên thương mại) |
| `withdrawal_days` | số nguyên từ 0 trở lên. Với `SPRAYING`: thiếu thì điền mức sàn, thấp hơn mức sàn thì từ chối |
| `fresh_leaf_kg` | tuỳ chọn, lớn hơn 0 và tối đa 100000; chỉ với `HARVEST` |

Thân request nhận thêm `client_id` (UUID, tuỳ chọn): khoá chống trùng khi gửi lại từ hàng đợi offline, duy nhất theo `(người gửi, client_id)`.

**Response:** 201 `{ "data": <nhật ký> }` khi tạo mới; **200** với cùng dạng khi `client_id` đã có (trả nhật ký đầu tiên, không tạo thêm). Nhật ký (và mỗi dòng của `GET /api/journal`) có thêm `cycle_id` (lứa; rỗng cho nhật ký nháp và nương chưa có lứa), `client_id`, và mỗi hoạt động có `pesticide_product_id` và `fresh_leaf_kg`.

**Errors:** 400 `VALIDATION_ERROR` (thân sai, hoặc "Không tìm thấy thuốc trong danh mục" khi `pesticide_product_id` không có); 403 `FORBIDDEN`; 422 `WITHDRAWAL_BELOW_FLOOR` ("Thời gian cách ly không được thấp hơn N ngày (mức sàn của thuốc này).").

### `PUT /api/journal/[id]` (thay đổi GĐ1)
**Vai:** `officer`, `farmer` (nông dân chỉ sửa nhật ký của hộ mình). Thân là `POST /api/journal` với mọi trường tuỳ chọn, thêm `submit` (boolean).

- Sửa được nhật ký `DRAFT`, `PENDING_APPROVAL`, `REJECTED` và `REQUEST_CHANGES`; nhật ký đã duyệt trả 422.
- `submit: true` chỉ dành cho nông dân (cán bộ nhận 403 `FORBIDDEN`). Với nhật ký `DRAFT` hoặc đã bị trả (`REJECTED`, `REQUEST_CHANGES`), nhật ký chuyển `PENDING_APPROVAL`, xoá `review_note` và `reviewed_by_id`, gán lứa theo ngày ghi và tính lại `safe_harvest_date` của hoạt động có `withdrawal_days`; cán bộ nhận thông báo. Khi nông dân gửi một nháp kê đơn của cán bộ, người gửi và `performed_by` đổi thành nông dân.
- Mức sàn cách ly chỉ được kiểm khi thân có `activities`.

**Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 422 `WITHDRAWAL_BELOW_FLOOR`; 422 `DOMAIN_ERROR` (nhật ký đã duyệt).

### `POST /api/parcels/[id]/approve-harvest` (thay đổi GĐ1)
Nghiệm thu đạt cách ly cho nương. **Vai:** `officer`, `manager`. Không có thân. Chuyển nương sang `HARVEST_APPROVED` và thông báo cho quản lý.

**Response:** 200 `{ "data": { "parcel": { ... } } }`.

Chỉ cho qua khi không còn lần phun chặn theo quy tắc (a) tại thời điểm gọi: mọi lần phun của nương có `entry_date` không sau lúc gọi và `safe_harvest_date` sau lúc gọi đều chặn, bất kể lứa; nhật ký `DRAFT` và `REJECTED` không tính.

**Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND` (nương của HTX khác); 422 `DOMAIN_ERROR` ("Chưa qua thời gian cách ly. An toàn thu hoạch từ ngày dd/mm/yyyy").

### `PUT /api/officer/diseases/[id]/review` (thay đổi GĐ1: kê đơn)
Thân như mục "Disease Diagnosis", thêm trường tuỳ chọn `prescription`, chỉ dùng khi `status` là `CONFIRMED`:
```json
{ "status": "CONFIRMED", "treatment_recommendation": "...", "confirmed_diagnosis": "Phồng lá",
  "prescription": { "pesticide_product_id": "cuid", "dosage": "0,4 lít/ha" } }
```
`dosage` tuỳ chọn, tối đa 100 ký tự. Khi có `prescription`, trong cùng giao dịch hệ thống tạo một nhật ký `DRAFT` loại `SPRAYING` cho nương của ca bệnh (ngày ghi là lúc duyệt, `withdrawal_days` bằng mức sàn hiệu lực của HTX, ghi chú `Theo kê đơn ca bệnh <id>`), và thông báo nông dân mở nhật ký nháp để bấm "Đã phun".

**Response:** `{ "success": true, "data": { "draftJournalEntryId": "cuid" } }` (`draftJournalEntryId` vắng khi không kê đơn).

**Errors (thêm):** 400 `VALIDATION_ERROR` "Chỉ kê đơn khi xác nhận ca bệnh." (kê đơn với `REJECTED`) và "Không tìm thấy thuốc trong danh mục.".

### `GET /api/schedule/harvest` (thay đổi GĐ1)
Mỗi sự kiện có thêm `parcelStatus` (trạng thái nương) và `canApprove` (đúng khi nương `TENDING`, lứa đang mở và không còn lần phun chặn theo quy tắc (a) tại lúc gọi). `safeHarvestDate` không còn giới hạn theo `cycle_id`: lứa đang mở lấy các lần phun của nương có `entry_date` không sau ngày thu hoạch dự kiến (hoặc hôm nay nếu chưa có); lứa đã hái dùng quy tắc (b) với ngày hái.

---

## Nhiều vai và quản trị nền tảng (GĐ1 S2)

### `POST /api/session/role`
Đổi vai đang dùng của phiên. **Vai:** mọi người đã đăng nhập, chỉ sang vai mình giữ.

**Request:** `{ "role": "manager" | "officer" | "accountant" | "farmer" | "platform_admin" }`

**Response:** `{ "data": { "role": "officer", "home": "/officer/dashboard" } }` (`home` là `/platform` cho `platform_admin`, nếu không `/<vai>/dashboard`).

**Errors:** 400 `VALIDATION_ERROR` (vai không có trong danh sách); 401 `UNAUTHORIZED`; 403 `FORBIDDEN` ("Bạn không có vai này.").

### `GET /api/members` (thay đổi GĐ1)
Mỗi người một dòng. Thêm `roles` (mọi vai người này giữ trong HTX) cạnh `role` (vai đầu tiên theo thứ tự `manager`, `officer`, `accountant`, `farmer`) và `status` (`ACTIVE` hoặc `PENDING`). Query `role` giữ người có vai đó trong `roles`. **Vai:** `manager`, `officer`.

### `POST /api/members/invite` (thay đổi GĐ1)
**Vai:** `manager`.

**Request:**
```json
{ "fullName": "Nguyễn Thị C", "phone": "0912345678", "pin": "123456", "role": "farmer", "roles": ["farmer", "accountant"], "address": "Xóm 3" }
```
`fullName` tối thiểu 2 ký tự, `phone` tối thiểu 10 ký tự, `pin` tối thiểu 6 ký tự. `roles` (tuỳ chọn, ít nhất một) là tập vai thuộc `farmer`, `officer`, `accountant`; thiếu thì dùng `[role]`, và `role` mặc định `farmer`. Không có trường email. Thêm vai `farmer` thì tạo hoặc nối hồ sơ nông hộ như trước; số điện thoại đã dùng thì 400 `VALIDATION_ERROR`.

**Response:** 201 `{ "data": { "keycloakUserId": "...", "householdId": "...|null", "username": "<phone>", "role": "...", "roles": ["..."], "message": "..." } }`.

**Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`.

### `PUT /api/members/[id]/roles`
Đặt lại các vai phụ của một thành viên cùng HTX. **Vai:** `manager`.

**Request:** `{ "roles": ["farmer", "officer", "accountant"] }` (tập con; không nhận `manager` hay `platform_admin`).

Hệ thống thêm và bớt realm role trong Keycloak cho đúng tập này, rồi đồng bộ `htx_memberships`. Thêm `farmer` thì tạo hoặc nối hồ sơ nông hộ; bớt `farmer` thì giữ hồ sơ và lịch sử.

**Response:** `{ "data": { "id": "<keycloak id>", "roles": ["manager", "farmer"] } }` (`roles` gồm cả `manager` nếu người đó là Trưởng HTX).

**Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN` (không phải `manager`, hoặc sửa vai của Trưởng HTX khác; một Trưởng HTX sửa được vai phụ của chính mình); 404 `NOT_FOUND` (thành viên không thuộc HTX này); 422 `DOMAIN_ERROR` ("Thành viên phải có ít nhất một vai" khi tập rỗng và người đó không phải Trưởng HTX).

### `DELETE /api/members/[id]` (thay đổi GĐ1)
Thêm: không xoá được Trưởng HTX (403 `FORBIDDEN` "Không thể xóa Trưởng HTX"). Thành viên của HTX khác trả 404 `NOT_FOUND`. Thành công trả `{ "success": true }`.

### `POST /api/platform/htx`
Tạo HTX và tài khoản Trưởng HTX đầu tiên. **Vai:** `platform_admin`.

**Request:**
```json
{ "htx_code": "TC", "name": "HTX Chè Tân Cương", "address": "Thái Nguyên",
  "manager": { "fullName": "Trần Văn D", "phone": "0987654321", "pin": "secret1" } }
```
`htx_code` khớp `^[A-Z0-9]{2,6}$`; `name` 2 đến 120 ký tự; `address` tuỳ chọn, tối đa 200; `manager.fullName` 2 đến 120; `manager.phone` 10 đến 15 ký tự; `manager.pin` 6 đến 64 ký tự. Nếu tạo tài khoản ở Keycloak lỗi, hồ sơ HTX vừa tạo bị xoá lại.

**Response:** 201 `{ "data": { "id": "cuid", "htx_code": "TC", "name": "HTX Chè Tân Cương" } }`.

**Errors:** 400 `VALIDATION_ERROR`; 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 409 `CONFLICT` ("Mã HTX này đã tồn tại", hoặc tài khoản Trưởng HTX bị từ chối vì trùng).

### `GET /api/platform/htx/[code]/agent-settings` và `PUT`
Cấu hình AI của một HTX, gồm hạn mức USD hằng tháng. **Vai:** `platform_admin`. Thân `PUT` và dạng dữ liệu như `PUT /api/agent/settings` trước đây (`agents`, `report_time`, `monthly_limit_usd`); nhà cung cấp `openai` cần `model`. `GET` trả `{ "data": { ...cấu hình, "providers": [...], "can_edit": true } }`; `PUT` trả `{ "data": <cấu hình đã lưu> }`.

**Errors:** 400 `VALIDATION_ERROR`; 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 404 `NOT_FOUND` (mã HTX không có).

### `GET /api/agent/settings` và `PUT` (thay đổi GĐ1)
`GET` (`manager`, `officer`) chỉ đọc: `can_edit` luôn `false`. `PUT` không còn lưu gì và luôn trả 403 `FORBIDDEN` ("Cấu hình AI do quản trị nền tảng đặt.").

---

## Bàn cân và giá lá tươi (GĐ1 S3)

Quy tắc nghiệp vụ (cách tính, khoá cách ly, huỷ phiếu): [rules-and-limits.md](./rules-and-limits.md) mục 3.22. Số tiền `amount_vnd` luôn là chuỗi số nguyên thập phân. Ngày là `YYYY-MM-DD` theo giờ Việt Nam.

**Phiếu cân** (dạng dùng chung):
```json
{
  "id": "cuid", "ticket_no": "TC-PC-20261128-001",
  "household_id": "cuid", "household_name": "Nguyễn Văn A",
  "parcel_id": "cuid", "parcel_code": "TC-A3", "cycle_id": "cuid|null",
  "grade_id": "cuid", "grade_name": "Loại 1 (1 tôm 2 lá)",
  "weighed_at": "2026-11-28T03:15:00.000Z",
  "gross_kg": 42.5, "deduction_pct": 5, "net_kg": 40.4,
  "price_vnd_per_kg": 9000, "amount_vnd": "363600",
  "status": "VALID", "void_reason": null, "settlement_id": null
}
```

### `GET /api/leaf-grades`
Mọi phẩm cấp của HTX (cả phẩm cấp đã ẩn), theo `sort_order` rồi tên. **Vai:** mọi vai của HTX. **Response:** `{ "data": [ { "id", "name", "sort_order", "active" } ] }`.

### `POST /api/leaf-grades`
**Vai:** `manager`. **Request:** `{ "name": "Loại 1", "sort_order": 1 }`. `name` 1 đến 60 ký tự; `sort_order` tuỳ chọn, 0 đến 1000 (thiếu thì đặt sau phẩm cấp cuối). Khoá lạ bị từ chối. **Response:** 201 `{ "data": { "id", "name", "sort_order", "active": true } }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 409 `CONFLICT` (trùng tên trong HTX).

### `PUT /api/leaf-grades/[id]`
**Vai:** `manager`. **Request:** một hay nhiều trong `name`, `sort_order`, `active` (ít nhất một). Ẩn phẩm cấp bằng `active: false`. **Response:** `{ "data": <phẩm cấp> }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `CONFLICT`.

### `GET /api/leaf-prices/today`
Giá hôm nay của các phẩm cấp đang dùng. **Vai:** mọi vai của HTX.

**Response:**
```json
{ "data": { "date": "2026-11-28", "published_at": "2026-11-28T01:00:00.000Z",
  "prices": [ { "grade_id": "cuid", "grade_name": "Loại 1", "price_vnd_per_kg": 9000, "yesterday_vnd_per_kg": 8800 } ] } }
```
`price_vnd_per_kg` và `yesterday_vnd_per_kg` là `null` khi chưa có giá; `published_at` là `null` khi hôm nay chưa công bố gì.

### `PUT /api/leaf-prices/today`
Công bố giá hôm nay. **Vai:** `manager`. **Request:** `{ "prices": [ { "grade_id": "cuid", "price_vnd_per_kg": 9000 } ] }`: 1 đến 50 phần tử, mỗi phẩm cấp một lần, giá nguyên từ 1 đến 10.000.000. Công bố lại trong ngày thì ghi đè. **Response:** như `GET`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND` ("Không tìm thấy phẩm cấp": một phẩm cấp không thuộc HTX hoặc đã ẩn; không ghi dòng nào).

### `POST /api/leaf-tickets`
Ghi một phiếu cân. **Vai:** `accountant`, `manager`.

**Request:**
```json
{ "household_id": "cuid", "parcel_id": "cuid", "grade_id": "cuid", "gross_kg": 42.5, "deduction_pct": 5, "client_id": "uuid" }
```
`gross_kg` lớn hơn 0, tối đa 5000; `deduction_pct` từ 0 đến 30; cả hai tối đa một chữ số thập phân; `client_id` tuỳ chọn (UUID). Khoá lạ bị từ chối (400): không có trường ngày hay bỏ qua cách ly.

**Response:** 201 `{ "data": <phiếu> }`; **200** với phiếu đầu tiên khi `client_id` đã dùng (gửi lại không tạo thêm).

**Errors:** 400 `VALIDATION_ERROR` (kể cả "Phẩm cấp này đã ẩn."); 403 `FORBIDDEN`; 404 `NOT_FOUND` (hộ, nương hoặc phẩm cấp không thuộc HTX, hoặc nương không thuộc hộ đó); 409 `PARCEL_IN_WITHDRAWAL` (nương còn cách ly; `error.safe_from` là ngày `YYYY-MM-DD` từ đó cân lại được, nằm cạnh `code` và `message`); 409 `NO_PRICE_TODAY`; 422 `DOMAIN_ERROR` ("Nương chưa được duyệt nên chưa cân được.").

### `GET /api/leaf-tickets`
Danh sách phiếu của HTX, mới nhất trước, 50 phiếu mỗi trang. **Vai:** `manager`, `accountant`, `officer`.

**Query:** `date` (ngày), `household_id`, `status` (`VALID` hoặc `VOIDED`), `cursor` (`next_cursor` của trang trước), tất cả tuỳ chọn.

**Response:**
```json
{ "data": [ <phiếu> ], "next_cursor": "cuid|null", "totals": { "net_kg": 120.4, "amount_vnd": "1083600" } }
```
`totals` cộng mọi phiếu `VALID` khớp bộ lọc, không chỉ trang hiện tại.

### `GET /api/leaf-tickets/[id]`
Một phiếu. **Vai:** `manager`, `accountant`, `officer`, `farmer` (nông dân chỉ phiếu của hộ mình; phiếu khác trả như không có). **Response:** `{ "data": <phiếu> }`. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `POST /api/leaf-tickets/[id]/void`
Huỷ một phiếu. **Vai:** `accountant`, `manager`. **Request:** `{ "reason": "Cân nhầm hộ" }` (3 đến 200 ký tự, sau khi cắt khoảng trắng). **Response:** `{ "data": <phiếu> }` với `status` `VOIDED` và `void_reason`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `TICKET_SETTLED` (phiếu đã vào kỳ quyết toán); 409 `TICKET_VOIDED` (đã huỷ).

### `GET /api/leaf-tickets/mine`
Tối đa 200 phiếu gần nhất của hộ người đăng nhập. **Vai:** `farmer`. **Response:** `{ "data": [ <phiếu> ] }`. **Errors:** 403 `FORBIDDEN`.

### `GET /api/leaf-tickets/export.csv`
Tệp CSV (UTF-8 có BOM, `Content-Disposition: attachment; filename="phieu-can-<from>_<to>.csv"`). **Vai:** `manager`, `accountant`. **Query bắt buộc:** `from`, `to` (ngày; `from` không sau `to`, khoảng tối đa 366 ngày). Tối đa 20.000 dòng, cũ nhất trước. Cột: Số phiếu, Giờ cân, Hộ, Nương, Phẩm cấp, Kg cân, % trừ, Kg tịnh, Giá (đ/kg), Thành tiền (đ), Trạng thái, Lý do huỷ. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`.

### `GET /api/households`
Tìm hộ của HTX theo tên hoặc số điện thoại, tối đa 20 hộ theo tên, kèm các nương cân được (không tính nương `DRAFT`). **Vai:** `accountant`, `manager`, `officer`. **Query:** `q` (cắt còn 60 ký tự; trống thì lấy 20 hộ đầu). **Response:** `{ "data": [ { "id", "name", "phone", "parcels": [ { "id", "parcel_code" } ] } ] }`.

### `GET /api/parcels/[id]/withdrawal-status`
Đèn cách ly của nương cho màn hình cân. **Vai:** `accountant`, `manager`, `officer`. **Query:** `at` (ngày, tuỳ chọn, mặc định hôm nay): chỉ đổi đèn, không phải đầu vào của phiếu. **Response:** `{ "data": { "blocked": true, "safe_from": "2026-12-05" } }` (`safe_from` là `null` khi không bị chặn). **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND` (nương của HTX khác).

### `GET /api/cycles/[id]/weighing-summary`
Đối chiếu kg một lứa: tổng kg tịnh các phiếu `VALID` và tổng `fresh_leaf_kg` ở nhật ký (không tính `DRAFT`, `REJECTED`). **Vai:** `manager`, `officer`. **Response:** `{ "data": { "ticket_net_kg": 120.4, "journal_fresh_leaf_kg": 125 } }`. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND` (lứa của HTX khác).

### `GET /api/app-store` (thay đổi GĐ1)
Mini-app `leaf-purchase` (và `farm-supply`) đã hợp nhất vào lõi nên bị ẩn khỏi danh sách khi `DXOS_LABS` tắt; thao tác bật chúng trả 409 `MERGED_INTO_CORE`.

---

## Vật tư ứng, sổ cái và quyết toán kỳ (GĐ1 S4)

Quy tắc nghiệp vụ (công thức chốt, sổ chỉ thêm, ngân hàng): [rules-and-limits.md](./rules-and-limits.md) mục 3.23. Mọi số tiền (`*_vnd` ở dạng chuỗi) là số nguyên đồng viết thành chuỗi thập phân, ngoại trừ `unit_price_vnd` là số. Ngày là `YYYY-MM-DD`. Mọi route chỉ tính trong HTX của phiên; bản ghi của HTX khác trả 404 `NOT_FOUND`.

**Vật tư:** `{ "id", "name", "unit", "unit_price_vnd": 12000, "kind": "FERTILIZER|PESTICIDE|OTHER", "pesticide_product_id": "cuid|null", "active": true }`

**Phiếu ứng:**
```json
{ "id": "cuid", "advance_no": "TC-VT-20261128-001", "household_id": "cuid", "household_name": "Nguyễn Văn A",
  "item_id": "cuid", "item_name": "Phân NPK", "unit": "kg", "quantity": 10.5, "unit_price_vnd": 12000,
  "amount_vnd": "126000", "advanced_on": "2026-11-28", "status": "VALID", "void_reason": null, "settlement_id": null }
```

**Kỳ:** `{ "id", "code": "TC-QT-20261130", "date_from", "date_to", "status": "DRAFT|CLOSED", "created_by_name", "closed_by_name", "closed_at" }`

**Dòng quyết toán (một hộ trong một kỳ):**
```json
{ "id": "cuid|null", "period_id": "cuid", "household_id": "cuid", "household_name": "Nguyễn Văn A",
  "leaf_net_kg": 120.4, "leaf_amount_vnd": "1083600", "advances_vnd": "126000",
  "debt_in_vnd": "0", "payable_vnd": "957600", "debt_out_vnd": "0",
  "paid_at": null, "payment_method": null, "payment_ref": null, "has_bank_account": true }
```
`id` là `null` và các trường trả tiền rỗng khi kỳ còn `DRAFT` (số tạm tính).

**Dòng sổ:** `{ "id", "household_id", "entry_type": "LEAF_CREDIT|INPUT_DEBIT|PAYOUT|ADJUSTMENT", "amount_vnd": "-126000", "note", "ticket_id", "advance_id", "settlement_id", "created_at" }`. Dương là HTX nợ hộ, âm là hộ nợ HTX. `ticket_id` và `advance_id` hiện luôn `null`; `settlement_id` là id của dòng quyết toán (rỗng với `ADJUSTMENT`).

### `GET /api/input-items`
Danh mục vật tư của HTX (đang dùng trước, rồi theo tên). **Vai:** `manager`, `accountant`, `officer`. **Response:** `{ "data": [ <vật tư> ] }`. **Errors:** 403 `FORBIDDEN`.

### `POST /api/input-items`
**Vai:** `manager`, `accountant`. **Request:** `{ "name", "unit", "unit_price_vnd", "kind", "pesticide_product_id"? }`: `name` 1 đến 80 ký tự, `unit` 1 đến 20, `unit_price_vnd` số nguyên 0 đến 100.000.000, `pesticide_product_id` chỉ với `kind` `PESTICIDE`. Khoá lạ bị từ chối. **Response:** 201 `{ "data": <vật tư> }`. **Errors:** 400 `VALIDATION_ERROR` (kể cả gắn thuốc cho vật tư không phải thuốc, hoặc "Không tìm thấy thuốc trong danh mục."); 403 `FORBIDDEN`; 409 `ITEM_EXISTS` (trùng tên trong HTX).

### `PUT /api/input-items/[id]`
**Vai:** `manager`, `accountant`. **Request:** một hay nhiều trong `name`, `unit`, `unit_price_vnd`, `kind`, `pesticide_product_id`, `active` (ít nhất một). Ẩn vật tư bằng `active: false`. **Response:** `{ "data": <vật tư> }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `ITEM_EXISTS`.

### `POST /api/input-advances`
Ghi một phiếu ứng vật tư. **Vai:** `accountant`, `manager`.

**Request:** `{ "household_id": "cuid", "item_id": "cuid", "quantity": 10.5, "advanced_on": "2026-11-28", "client_id": "uuid" }`. `quantity` lớn hơn 0, tối đa 100.000, tối đa hai chữ số thập phân; `advanced_on` tuỳ chọn, mặc định hôm nay (giờ Việt Nam), không được ở tương lai; `client_id` tuỳ chọn. Khoá lạ bị từ chối. `amount_vnd` = số lượng × đơn giá của vật tư lúc ghi, làm tròn đến đồng, nửa làm tròn lên.

**Response:** 201 `{ "data": <phiếu ứng> }`; **200** với phiếu đầu tiên khi `client_id` đã dùng.

**Errors:** 400 `VALIDATION_ERROR` ("Ngày ứng không được ở tương lai.", "Vật tư này đã ẩn.", "Vật tư chưa có đơn giá."); 403 `FORBIDDEN`; 404 `NOT_FOUND` (hộ hoặc vật tư không thuộc HTX).

### `GET /api/input-advances`
Phiếu ứng của HTX, mới nhất trước, 50 phiếu mỗi trang. **Vai:** `manager`, `accountant`, `officer`. **Query (tuỳ chọn):** `household_id`, `from`, `to` (ngày, gồm cả hai đầu), `status` (`VALID` hoặc `VOIDED`), `cursor`. **Response:** `{ "data": [ <phiếu ứng> ], "next_cursor": "cuid|null", "totals": { "amount_vnd": "126000" } }`; `totals` cộng mọi phiếu `VALID` khớp bộ lọc.

### `POST /api/input-advances/[id]/void`
**Vai:** `accountant`, `manager`. **Request:** `{ "reason": "..." }` (3 đến 200 ký tự). **Response:** `{ "data": <phiếu ứng> }` với `status` `VOIDED`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `ADVANCE_SETTLED` (đã vào quyết toán); 409 `ADVANCE_VOIDED`.

### `GET /api/input-advances/export.csv`
CSV UTF-8 có BOM, `phieu-ung-<from>_<to>.csv`. **Vai:** `manager`, `accountant`. **Query bắt buộc:** `from`, `to` (cùng luật như `GET /api/leaf-tickets/export.csv`: tối đa 366 ngày). Tối đa 20.000 dòng, ngày ứng cũ nhất trước. Cột: Số phiếu, Ngày ứng, Hộ, Vật tư, Đơn vị, Số lượng, Đơn giá (đ), Thành tiền (đ), Trạng thái, Lý do huỷ. Ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm dấu nháy đơn. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`.

### `GET /api/banks`
Danh sách 21 ngân hàng nhận tiền. **Vai:** mọi vai của HTX. **Response:** `{ "data": [ { "bin": "970405", "name": "Agribank" } ] }`.

### `PUT /api/households/[id]/bank`
Đặt tài khoản nhận tiền của một hộ. **Vai:** `manager`, `accountant`. **Request:** `{ "bank_bin": "970405", "bank_account": "8600201001234", "bank_account_name": "NGUYEN VAN A" }`: `bank_bin` đúng 6 chữ số và có trong `GET /api/banks`; `bank_account` 6 đến 19 chữ số; `bank_account_name` 1 đến 60 ký tự. **Response:** `{ "data": { "bank_bin", "bank_name", "account_masked": "*********1234", "bank_account_name" } }` (không có số đủ). **Errors:** 400 `VALIDATION_ERROR` (kể cả "Ngân hàng không có trong danh sách."); 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `GET /api/households/[id]/bank`
Điền sẵn biểu mẫu tài khoản. **Vai:** `manager`, `accountant`. **Response:** `{ "data": null }` khi hộ chưa khai, nếu không `{ "data": { "bank_bin", "bank_name", "bank_account", "account_masked", "bank_account_name" } }` với `bank_account` là số đủ. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `GET /api/households/[id]/ledger`
Sổ của một hộ. **Vai:** `manager`, `accountant`. **Response:** `{ "data": <sổ> }` (dạng bên dưới). **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `GET /api/ledger/mine`
Sổ của mọi hộ gắn với tài khoản người đăng nhập, gộp theo hộ. **Vai:** `farmer`. **Errors:** 403 `FORBIDDEN`.

**Sổ (`data` của hai route trên):**
```json
{
  "balance_vnd": "957600",
  "households": [ { "household_id": "cuid", "household_name": "Nguyễn Văn A", "balance_vnd": "957600" } ],
  "entries": [ <dòng sổ> ],
  "unsettled_tickets": [ <phiếu cân> ],
  "unsettled_advances": [ <phiếu ứng> ],
  "lines": [ { ...<dòng quyết toán>, "period_code": "TC-QT-20261130", "date_from": "2026-11-01", "date_to": "2026-11-30" } ]
}
```
`balance_vnd` là số tạm tính: số dư sổ cộng tiền phiếu cân `VALID` chưa quyết toán trừ tiền phiếu ứng `VALID` chưa quyết toán; dương là HTX nợ hộ. `households` có số tạm tính từng hộ. `entries` tối đa 200 dòng mới nhất, `unsettled_tickets` và `unsettled_advances` tối đa 200, `lines` tối đa 100 dòng quyết toán mới nhất.

### `POST /api/settlements`
Tạo kỳ `DRAFT`. **Vai:** `manager`, `accountant`. **Request:** `{ "date_from": "2026-11-01", "date_to": "2026-11-30" }` (`date_from` không sau `date_to`). Mã kỳ `{HTX}-QT-YYYYMMDD` theo `date_to`. **Response:** 201 `{ "data": <kỳ> }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 422 `DOMAIN_ERROR` (`date_to` sau hôm nay; còn một kỳ nháp; kỳ mới chồng hoặc hở ngày so với kỳ gần nhất; còn phiếu trước ngày bắt đầu kỳ đầu tiên).

### `GET /api/settlements`
Mọi kỳ của HTX, `date_to` mới nhất trước. **Vai:** `manager`, `accountant`. **Response:** `{ "data": [ <kỳ> ] }`.

### `GET /api/settlements/[id]`
**Vai:** `manager`, `accountant`. **Response:** `{ "data": { "period": <kỳ>, "lines": [ <dòng quyết toán> ], "totals": { "households": 12, "leaf_amount_vnd": "...", "advances_vnd": "...", "payable_vnd": "...", "debt_out_vnd": "..." } } }`. Kỳ `DRAFT` trả số tạm tính của mọi phiếu chưa quyết toán đến hết `date_to` (dòng không có `id`); kỳ `CLOSED` trả các dòng đã lưu. Dòng xếp theo tên hộ. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `POST /api/settlements/[id]/close`
Chốt kỳ cho cả HTX trong một giao dịch. **Vai:** `manager` (chỉ vai đang dùng là `manager`).

**Request:** `{ "expected_household_count": 12, "expected_payable_total_vnd": "11491200" }`: số hộ và tổng `payable_vnd` mà hộp xác nhận đã hiện (chuỗi số nguyên không âm).

Chốt gom mọi phiếu cân và phiếu ứng `VALID` chưa quyết toán đến hết `date_to` (kể cả phiếu trước `date_from`), ghi dòng quyết toán và dòng sổ, đặt kỳ `CLOSED`. **Response:** như `GET /api/settlements/[id]` của kỳ đã chốt.

**Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `PERIOD_CLOSED` (đã chốt); 409 `PERIOD_CHANGED` (số tính lại khác `expected_*`, hoặc phiếu vừa đổi; lỗi có thêm `error.totals` là số mới khi khác `expected_*`, không ghi gì).

### `POST /api/settlements/[id]/lines/[lineId]/payout`
Ghi đã trả cho một dòng của kỳ đã chốt. **Vai:** `accountant`, `manager`. **Request:** `{ "method": "TRANSFER" | "CASH", "ref": "..." }` (`ref` tuỳ chọn, tối đa 60 ký tự). Ghi một dòng sổ `PAYOUT` âm bằng `payable_vnd`. **Response:** `{ "data": <dòng quyết toán> }` với `paid_at`, `payment_method`, `payment_ref`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `NOTHING_TO_PAY` (`payable_vnd` bằng 0); 409 `ALREADY_PAID`.

### `GET /api/settlements/[id]/lines/[lineId]/slip`
Phiếu quyết toán của một dòng. **Vai:** `manager`, `accountant`, `farmer` (chỉ dòng của hộ gắn với tài khoản mình; dòng của hộ khác trả 404).

**Response:**
```json
{ "data": {
  "htx": { "name": "HTX Chè Tân Cương", "code": "TC" },
  "household": { "id": "cuid", "name": "Nguyễn Văn A" },
  "period": <kỳ>,
  "tickets": [ <phiếu cân của dòng> ],
  "advances": [ <phiếu ứng của dòng> ],
  "line": <dòng quyết toán>,
  "qr": { "data_url": "data:image/png;base64,...", "bank_name": "Agribank", "account_masked": "*********1234", "account_full": "8600201001234" },
  "transfer_note": "QT 20261130 K7M2"
} }
```
`qr` là `null` khi hộ chưa có ngân hàng và tài khoản hoặc `payable_vnd` bằng 0. `account_full` chỉ có với `manager` và `accountant`; phiếu của `farmer` vẫn có ảnh QR mã hoá đúng tài khoản của họ nhưng không có số đủ ở dạng chữ. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `POST /api/ledger/adjustments`
Sửa sai sổ bằng một dòng `ADJUSTMENT` (sổ không sửa hay xoá dòng cũ). **Vai:** `manager`. **Request:** `{ "household_id": "cuid", "amount_vnd": "-50000", "reason": "Sửa nhầm số lượng phiếu ứng" }`: `amount_vnd` là chuỗi số nguyên khác 0 (có thể âm, tối đa 15 chữ số), `reason` 5 đến 200 ký tự. **Response:** 201 `{ "data": <dòng sổ> }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`.

---

## Mẻ sao sấy, lô từ mẻ, chứng nhận và trang QR (GĐ2)

Mọi route dưới đây trả `{ "data": ... }` khi thành công và `{ "error": { "code", "message", ...chi tiết } }` khi lỗi (lỗi 409 và 422 có mã riêng và có thể kèm trường chi tiết nằm cạnh `code`), chỉ tính trong HTX của phiên; bản ghi của HTX khác trả 404 `NOT_FOUND`. Quy tắc nghiệp vụ: [rules-and-limits.md](./rules-and-limits.md) mục 3.24 đến 3.26. Ngày là `YYYY-MM-DD` giờ Việt Nam, kg có một chữ số thập phân.

**Mẻ (`BatchView`):**
```json
{ "id": "cuid", "batch_code": "TC-MS-20261128-01", "processed_on": "2026-11-28", "status": "OPEN|FINISHED|CANCELLED",
  "master_name": null, "shift": null, "notes": null, "ticket_count": 4, "fresh_kg": 212.4, "dry_kg": 44.0,
  "recovery_ratio": 4.83, "out_of_band": false, "deviation_note": null,
  "created_at": "...", "finished_at": null, "cancel_reason": null }
```
Mẻ `OPEN` có `fresh_kg`, `dry_kg`, `recovery_ratio` và `out_of_band` tạm tính từ phiếu và sản lượng hiện có (`recovery_ratio` là `null` khi chưa có sản lượng); mẻ `FINISHED` giữ số đã chốt.

**Chi tiết mẻ (`BatchDetail`):** `{ "batch": <mẻ>, "tickets": [ <phiếu cân, dạng của GĐ1 S3> ], "outputs": [ { "id", "grade": "DINH|TOM_NON|MOC_CAU|BOM|CAM", "kg", "remaining_kg" } ], "preview": { "fresh_kg", "dry_kg", "recovery_ratio", "out_of_band" } }`.

### `GET /api/processing-batches`
Mẻ của HTX, ngày chế biến mới nhất trước, tối đa 200 mẻ. **Vai:** `officer`, `manager`. **Query (tuỳ chọn):** `status` (`OPEN`, `FINISHED`, `CANCELLED`), `from`, `to` (ngày chế biến, gồm cả hai đầu). **Response:** `{ "data": [ <mẻ> ] }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`.

### `POST /api/processing-batches`
Mở mẻ mới. **Vai:** `officer`, `manager`. **Request:** `{ "processed_on": "2026-11-28", "master_name": "...", "shift": "...", "notes": "..." }`: `processed_on` bắt buộc; `master_name` tối đa 80, `shift` 40, `notes` 500 ký tự (tuỳ chọn). Khoá lạ bị từ chối. **Response:** 201 `{ "data": <mẻ> }` (trạng thái `OPEN`, mã `{HTX}-MS-YYYYMMDD-NN`). **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 422 `DOMAIN_ERROR` ("Ngày chế biến không được sau hôm nay.").

### `GET /api/processing-batches/[id]`
**Vai:** `officer`, `manager`. **Response:** `{ "data": <BatchDetail> }`. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `GET /api/processing-batches/available-tickets`
Phiếu cân chọn được vào mẻ: `VALID`, của HTX, chưa vào mẻ nào, cân trong khoảng ngày (mặc định 30 ngày Việt Nam gần nhất đến hôm nay), cũ nhất trước, tối đa 500. **Vai:** `officer`, `manager`. **Query:** `from`, `to` (tuỳ chọn; `from` không sau `to`). **Response:** `{ "data": [ <phiếu cân> ] }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`.

### `POST /api/processing-batches/[id]/tickets`
Thêm phiếu nguyên phiếu vào mẻ `OPEN`. **Vai:** `officer`, `manager`. **Request:** `{ "ticket_ids": ["cuid", "..."] }` (1 đến 200 phiếu, không lặp). **Response:** `{ "data": <BatchDetail> }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `BATCH_NOT_OPEN`; 409 `TICKETS_CHANGED` (có phiếu vừa huỷ, vừa vào mẻ khác hoặc không thuộc HTX; không phiếu nào được thêm).

### `DELETE /api/processing-batches/[id]/tickets/[ticketId]`
Bỏ một phiếu khỏi mẻ `OPEN`. **Vai:** `officer`, `manager`. **Response:** `{ "data": <BatchDetail> }`. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND` (mẻ không có, hoặc phiếu không nằm trong mẻ); 409 `BATCH_NOT_OPEN`.

### `PUT /api/processing-batches/[id]/outputs`
Thay cả bộ sản lượng chè khô của mẻ `OPEN`. **Vai:** `officer`, `manager`. **Request:** `{ "outputs": [ { "grade": "TOM_NON", "kg": 20.5 } ] }`: 0 đến 5 dòng, mỗi hạng một dòng, `kg` lớn hơn 0, tối đa 100.000, một chữ số thập phân. **Response:** `{ "data": <BatchDetail> }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `BATCH_NOT_OPEN`.

### `POST /api/processing-batches/[id]/finish`
Hoàn thành mẻ. **Vai:** `officer`, `manager`. **Request:** `{ "deviation_note": "..." }` (tuỳ chọn; nếu gửi thì 10 đến 500 ký tự sau khi cắt khoảng trắng). Mẻ phải có ít nhất một phiếu và một dòng sản lượng. Tỷ lệ ngoài 4,50 đến 5,00 (xét trên tỷ lệ làm tròn 2 chữ số) thì `deviation_note` bắt buộc; trong khoảng chuẩn thì ghi chú không được lưu. **Response:** `{ "data": <BatchDetail> }` với `status` `FINISHED`. **Errors:** 400 `VALIDATION_ERROR` (ghi chú ngắn hơn 10 hoặc dài hơn 500 ký tự); 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `BATCH_NOT_OPEN`; 422 `BATCH_EMPTY`; 422 `DEVIATION_NOTE_REQUIRED` (tỷ lệ ngoài khoảng chuẩn mà không có ghi chú; kèm `error.recovery_ratio`).

### `POST /api/processing-batches/[id]/cancel`
Huỷ mẻ `OPEN`; mọi phiếu của mẻ được trả lại. **Vai:** `officer`, `manager`. **Request:** `{ "reason": "..." }` (3 đến 200 ký tự). **Response:** `{ "data": <mẻ> }` với `status` `CANCELLED` và `cancel_reason`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `BATCH_NOT_OPEN`.

### `POST /api/leaf-tickets/[id]/void` (thay đổi GĐ2)
Thêm điều kiện: phiếu đã vào một mẻ sao không huỷ được. **Errors (thêm):** 409 `TICKET_IN_BATCH` ("Phiếu đã vào mẻ sao {mã mẻ}. Bỏ phiếu khỏi mẻ trước khi huỷ."). Các lỗi khác như mục GĐ1 S3.

### `GET /api/dry-stock`
Tồn chè khô: các dòng sản lượng của mẻ `FINISHED` còn kg lớn hơn 0, mẻ cũ nhất trước. **Vai:** `officer`, `manager`. **Query:** `grade` (tuỳ chọn, một trong năm hạng). **Response:**
```json
{ "data": [ { "output_id": "cuid", "batch_id": "cuid", "batch_code": "TC-MS-20261128-01", "processed_on": "2026-11-28",
  "grade": "TOM_NON", "kg": 20.5, "remaining_kg": 15.5, "recovery_ratio": 4.83, "out_of_band": false } ] }
```
**Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`.

### `POST /api/lots/from-batches`
Đóng lô từ tồn chè khô của một hạng. **Vai:** `officer`, `manager`.

**Request:**
```json
{ "grade": "TOM_NON", "sources": [ { "output_id": "cuid", "kg": 15.5 } ],
  "packaging_type": "Túi 25kg", "destination": "...", "buyer_name": "..." }
```
`sources` 1 đến 50 dòng, mỗi dòng một lần, `kg` lớn hơn 0, tối đa 100.000, một chữ số thập phân; `packaging_type` tối đa 100, `destination` và `buyer_name` tối đa 200 ký tự, tuỳ chọn.

**Response:** 201 `{ "data": { "id", "lot_code": "TC-CHE-20261128-001", "commodity": "Chè", "harvest_date", "estimated_weight_kg", "actual_weight_kg": null, "status": "READY", "parcel_count", "created_at", "dry_grade": "TOM_NON" } }`.

**Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 409 `STOCK_CHANGED` (dòng không thuộc HTX, mẻ chưa hoàn thành, kg lấy lớn hơn tồn còn lại, hoặc mẻ nguồn không có phiếu cân; kèm `error.stock` là tồn mới, dạng `GET /api/dry-stock`); 422 `GRADE_MISMATCH` (dòng khác hạng với lô); 422 `WITHDRAWAL_NOT_PASSED` (một phiếu nguồn chưa qua cách ly ở ngày cân của nó; kèm `parcel_code`, `weighed_on`, `safe_on`).

### `GET /api/lots` (thay đổi GĐ2)
**Vai:** `officer`, `manager`. **Query:** `status` (`DRAFT`, `READY`, `QR_EXPORTED`), `visibility` (`published` giữ lô `READY` và `QR_EXPORTED`). **Response:** `{ "data": [ { "id", "lot_code", "commodity", "harvest_date", "estimated_weight_kg", "actual_weight_kg", "status", "parcel_count", "created_at" } ] }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`.

### `POST /api/lots` (đóng băng)
Tạo lô từ thửa (`parcel_ids`). Chỉ chạy khi `DXOS_LABS` bật; tắt thì **404 `NOT_FOUND`** ("Tính năng này chưa mở.") trước mọi xử lý khác. **Vai:** `officer`. Khi bật, dạng thân và lỗi như mục "Lots & QR Traceability" ở trên (kèm `certificate_keys` phải nằm dưới thư mục tài liệu của HTX); mã lô `{HTX}-{CROP}-{YYYYMMDD}-{NNN}` đánh dưới khoá tư vấn.

### `GET /api/lots/[id]`
**Vai:** `officer`, `manager`. **Response:** `{ "data": { ...tóm tắt lô, "trace": <dữ liệu truy xuất> } }`. Dữ liệu truy xuất của lô từ mẻ có thêm `dry_grade`, `batches[]` (`batch_code`, `processed_on`, `master_name`, `fresh_kg`, `dry_kg`, `recovery_ratio`, `out_of_band`, `grade`, `kg_in_lot`, `ticket_count`, `parcel_codes[]`), `intake[]` (mỗi phiếu nguồn: `parcel_code`, `cycle_label`, `weighed_on`, `net_kg`, `safe_on`; không tên hộ, không mã phiếu) và `certificates[]` (`id`, `kind`, `number`, `issuer`, `issued_on`, `expires_on`, `file_key`, `revoked_at`). **Errors:** 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `POST /api/lots/[id]/export-qr` (thay đổi GĐ2)
Xuất QR, chốt ảnh chụp dữ liệu truy xuất và gắn chứng nhận. **Vai:** `officer`, `manager`.

**Request (tuỳ chọn cả thân):** `{ "certificate_ids": ["cuid"], "certificate_keys": ["para/TC/Certificates/..."] }`. `certificate_ids` tối đa 20; không gửi thì gắn mọi chứng nhận còn hiệu lực của HTX. `certificate_keys` là khoá tệp phải nằm dưới thư mục tài liệu của HTX (400 `VALIDATION_ERROR` nếu sai). Thân sai dạng trả 400, không bao giờ hiểu là "gắn tất cả".

Điều kiện: lô `READY`; lô phải có nguồn mẻ (trừ khi `DXOS_LABS` bật); lô có ít nhất một thửa liên kết; không còn lần phun chặn. Lô từ mẻ được kiểm theo từng phiếu nguồn, không kiểm "mỗi thửa có lứa đã hái" như lô từ thửa. Mỗi chứng nhận gửi lên phải thuộc HTX và còn hiệu lực hôm nay, và được kiểm lại dưới khoá dòng khi ghi.

**Response:** `{ "data": { "lot_code": "TC-CHE-20261128-001", "qr_image_url": "...", "public_page_url": "/q/TC-CHE-20261128-001" } }`. Ảnh QR mã hoá `{gốc}/q/{mã lô}`.

**Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 422 `LOT_WITHOUT_BATCH`; 422 `WITHDRAWAL_NOT_PASSED` (mã nay nằm ở trường `code`, trước đây chỉ là tiền tố của thông điệp); 422 `CERTIFICATE_NOT_VALID` (kèm `certificate_ids` sai); 422 `DOMAIN_ERROR` (lô đã xuất, lô không ở `READY`, lô không có thửa, thửa chưa có lứa đã hái ở đường lô từ thửa).

### `GET /api/certificates`
Mọi chứng nhận của HTX, hết hạn muộn nhất trước. **Vai:** `officer`, `manager`. **Response:**
```json
{ "data": [ { "id": "cuid", "kind": "VIETGAP|OCOP|ORGANIC|OTHER", "number": "VG-123", "issuer": "Sở NN&PTNT", "issued_on": "2026-01-10",
  "expires_on": "2028-01-09", "scope_note": null, "file_name": "vietgap.pdf", "file_mime": "application/pdf", "file_size": 482113,
  "revoked_at": null, "revoke_reason": null, "status": "VALID|EXPIRED|REVOKED" } ] }
```
`status` tính lúc đọc: `REVOKED` khi có `revoked_at`, `EXPIRED` khi hôm nay sau `expires_on`, còn lại `VALID`. Khoá tệp không nằm trong phản hồi. **Errors:** 403 `FORBIDDEN`.

### `POST /api/certificates`
Thêm chứng nhận kèm tệp. **Vai:** `officer`, `manager`. **Request:** `multipart/form-data` với `file` (PDF, JPG hoặc PNG, tối đa 10 MB) và các trường văn bản `kind`, `number` (1 đến 60 ký tự), `issuer` (1 đến 120), `issued_on`, `expires_on` (không trước `issued_on`), `scope_note` (tối đa 200, tuỳ chọn). Máy chủ kiểm byte đầu của tệp khớp loại khai báo. **Response:** 201 `{ "data": <chứng nhận> }`. **Errors:** 400 `VALIDATION_ERROR` (thiếu tệp hoặc trường sai); 400 `FILE_TOO_LARGE`; 400 `FILE_TYPE`; 403 `FORBIDDEN`.

### `GET /api/certificates/[id]/file`
Mở tệp chứng nhận. **Vai:** `officer`, `manager`. **Response:** 302 chuyển hướng tới liên kết ký sẵn hiệu lực 1 giờ. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `POST /api/certificates/[id]/revoke`
**Vai:** `manager`. **Request:** `{ "reason": "..." }` (3 đến 200 ký tự). **Response:** `{ "data": <chứng nhận> }` với `status` `REVOKED`. Chứng nhận đã gắn vào lô vẫn hiện trên trang QR, với trạng thái mới. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `CERTIFICATE_REVOKED`.

### `GET /api/htx/public-settings`
**Vai:** `manager`, `officer`. **Response:** `{ "data": { "public_show_names": false } }`. **Errors:** 403 `FORBIDDEN`.

### `PUT /api/htx/public-settings`
Bật hoặc tắt hiện tên người trên trang QR công khai. **Vai:** `manager`. **Request:** `{ "public_show_names": true }` (khoá lạ bị từ chối). **Response:** `{ "data": { "public_show_names": true } }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`.

### `GET /q/[lotCode]` (trang công khai, không phải route API)
Trang Server Component không cần đăng nhập; mã lô sai ký tự (`/`, `?`, `#`, xuống dòng, hoặc dài hơn 100) hiện "Mã QR không hợp lệ", lô không có hiện "Không tìm thấy dữ liệu". Dựng bốn tầng (Vùng trồng; An toàn cách ly; Mẻ sao chế biến; Chứng nhận) từ dữ liệu truy xuất của lô, chứng nhận đọc trực tiếp lúc dựng trang, tên người (hộ, người ghi nhật ký, thợ sao) ẩn trừ khi `public_show_names` bật, cộng khối "Kiểm chứng trong sổ audit" (bộ nhớ đệm 5 phút). `GET /lot/[lotCode]` chuyển hướng 308 tới đây.

### `/lots/[lot_code]/labels` (trang in tem, không phải route API)
`/officer/lots/[lot_code]/labels` (vai `officer`) và `/manager/lots/[lot_code]/labels` (vai `manager`); vai khác bị chuyển về `/login`. Trang chỉ có cho hai vai này. Chọn khổ tem 50×30, 40×30 hoặc 60×40 mm và 1 đến 500 tem; mỗi tem có QR tới `{gốc trang}/q/{mã lô}`, mã lô, "Chè {hạng}", khối lượng lô và tên HTX.

---

## Bảng điều hành, bán hàng, Core Action API và báo cáo (GĐ3)

Mọi route dưới đây trả `{ "data": ... }` khi thành công và `{ "error": { "code", "message", ...chi tiết } }` khi lỗi; chỉ tính trong HTX của phiên (bản ghi HTX khác trả 404 `NOT_FOUND`). Quy tắc nghiệp vụ: [rules-and-limits.md](./rules-and-limits.md) mục 3.27 đến 3.30. Tiền (`*_vnd`) là số nguyên đồng viết thành chuỗi, trừ `price_vnd_per_kg` và `outstanding_vnd` trong lỗi `OVERPAYMENT` ghi rõ dưới đây; ngày là `YYYY-MM-DD` giờ Việt Nam. Bảng điều hành (S7) do trang `/manager/dashboard` và `/accountant/dashboard` đọc thẳng ở máy chủ nên **không có route API riêng**.

**Đơn bán (`SalesOrderView`):**
```json
{ "id": "cuid", "order_no": "TC-DH-20261128-001", "kind": "WHOLESALE", "source": "CORE", "external_ref": null,
  "partner_id": "cuid", "partner_name": "Thương lái A", "customer_name": null,
  "ordered_on": "2026-11-28", "due_on": "2026-12-28", "status": "CONFIRMED",
  "total_vnd": "1125000", "paid_vnd": "500000", "outstanding_vnd": "625000", "overdue": false, "note": null,
  "created_at": "...", "cancelled_at": null, "cancel_reason": null,
  "lines": [ { "id": "cuid", "lot_id": "cuid", "lot_code": "TC-CHE-20261128-001", "net_g": 12500, "pack_count": null, "pack_net_g": null,
               "price_vnd_per_kg": 90000, "amount_vnd": "1125000" } ],
  "payments": [ { "id": "cuid", "amount_vnd": "500000", "paid_on": "2026-11-28", "method": "TRANSFER", "ref": null, "created_at": "..." } ] }
```
`paid_vnd` và `outstanding_vnd` tính từ các khoản thu; `overdue` đúng khi đơn sỉ `CONFIRMED`, còn nợ và `due_on` trước hôm nay.

### `GET /api/sales/sellable-lots`
Lô còn bán được: `QR_EXPORTED`, có khối lượng, còn lại lớn hơn 0 gam; mới nhất trước. **Vai:** `manager`, `accountant`. **Response:** `{ "data": [ { "lot_id", "lot_code", "dry_grade": "TOM_NON|null", "quality_grade": "Tôm nõn|null", "capacity_g": 50000, "remaining_g": 37500 } ] }`. **Errors:** 403 `FORBIDDEN`.

### `GET /api/sales/orders`
Danh sách đơn, mới nhất trước, 50 đơn mỗi trang. **Vai:** `manager`, `accountant`. **Query (tuỳ chọn):** `kind` (`WHOLESALE`, `RETAIL`), `status` (`CONFIRMED`, `CANCELLED`), `overdue` (chỉ giá trị `1`: chỉ đơn sỉ quá hạn), `partner_id`, `cursor` (`next_cursor` của trang trước). **Response:** `{ "data": [ <đơn> ], "next_cursor": "cuid|null" }`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`.

### `POST /api/sales/orders`
Tạo đơn bán sỉ từ tồn lô. **Vai:** `manager`, `accountant`.

**Request:**
```json
{ "partner_id": "cuid", "ordered_on": "2026-11-28", "due_on": "2026-12-28", "note": "...",
  "lines": [ { "lot_id": "cuid", "kg": 12.5, "price_vnd_per_kg": 90000 } ] }
```
`partner_id` bắt buộc. `ordered_on` mặc định hôm nay; `due_on` mặc định `ordered_on` cộng 30 ngày và không được trước `ordered_on`. `note` 1 đến 500 ký tự. `lines` 1 đến 50 dòng: `kg` lớn hơn 0, tối đa 1.000.000, một chữ số thập phân; `price_vnd_per_kg` số nguyên từ 1 đến 10.000.000. Khoá lạ bị từ chối. Thành tiền dòng = giá × gam / 1000, làm tròn đến đồng, nửa làm tròn lên.

**Response:** 201 `{ "data": <đơn> }`.

**Errors:** 400 `VALIDATION_ERROR` (kể cả "Hạn thanh toán không được trước ngày đặt"); 403 `FORBIDDEN`; 404 `NOT_FOUND` (thương lái hoặc lô không thuộc HTX); 409 `LOT_STOCK_SHORT` (lô không còn đủ; kèm `error.stock: [ { lot_id, remaining_g } ]` cho các lô thiếu); 422 `LOT_NOT_SELLABLE` (lô chưa xuất QR hoặc chưa có khối lượng; kèm `lot_id`).

### `GET /api/sales/orders/[id]`
**Vai:** `manager`, `accountant`. **Response:** `{ "data": <đơn> }`. **Errors:** 403 `FORBIDDEN`; 404 `NOT_FOUND`.

### `PATCH /api/sales/orders/[id]`
Đổi hạn thanh toán của đơn sỉ còn nợ. **Vai:** `manager`, `accountant`. **Request:** `{ "due_on": "2027-01-15" }`. **Response:** `{ "data": <đơn> }`. **Errors:** 400 `VALIDATION_ERROR` (ngày sai hoặc trước ngày đặt); 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `ORDER_CANCELLED`; 409 `ORDER_PAID` (đã thu đủ); 422 `NOT_WHOLESALE`.

### `POST /api/sales/orders/[id]/payments`
Ghi một khoản thu (chỉ thêm, không sửa hay xoá). **Vai:** `manager`, `accountant`. **Request:** `{ "amount_vnd": 500000, "paid_on": "2026-11-28", "method": "TRANSFER", "ref": "..." }`: `amount_vnd` là **số nguyên JSON** từ 1 đến 1.000.000.000.000; `paid_on` mặc định hôm nay; `method` `TRANSFER` hoặc `CASH`; `ref` 1 đến 100 ký tự, tuỳ chọn. **Response:** 201 `{ "data": <đơn> }` đã gồm khoản thu mới. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `ORDER_CANCELLED`; 409 `OVERPAYMENT` (vượt số còn phải thu; kèm `error.outstanding_vnd` dạng chuỗi).

### `POST /api/sales/orders/[id]/cancel`
Huỷ đơn; phần đã bán của lô quay về tồn. **Vai:** `manager`. **Request:** `{ "reason": "..." }` (3 đến 200 ký tự). **Response:** `{ "data": <đơn> }` với `status` `CANCELLED`. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; 404 `NOT_FOUND`; 409 `ORDER_CANCELLED`; 409 `ORDER_HAS_PAYMENTS`.

### `GET /api/sales/receivables`
Công nợ thương lái (đơn sỉ `CONFIRMED` còn nợ), nợ nhiều nhất trước. **Vai:** `manager`, `accountant`. **Response:** `{ "data": { "outstanding_vnd": "625000", "overdue_count": 1, "overdue_vnd": "625000", "partners": [ { "partner_id", "partner_name", "outstanding_vnd", "overdue_vnd" } ] } }`. **Errors:** 403 `FORBIDDEN`.

### `GET /api/partners` (thay đổi GĐ3)
Thêm vai `accountant` đọc được danh sách (để chọn thương lái); thêm, sửa và xoá đối tác vẫn chỉ `manager`. Vai được đọc: `manager`, `officer`, `accountant`.

### Core Action API cho mini-app: `/api/internal/apps/*`
Chỉ ở cổng nội bộ 9081 của gateway (cổng 9080 không có route này). Người gọi là mini-app, chuyển nguyên `Authorization: Bearer <token của chính Trưởng HTX>`; gateway gắn `X-Dxos-Gateway`, và web kiểm lại token: chữ ký, thời hạn, `iss`, `aud`; `azp` phải là client đăng nhập của web (nếu không 401); token vai dịch vụ bị từ chối 403; cần claim `htx_code`; vai `manager` bắt buộc (403 nếu không); HTX lấy từ token. Mọi route dưới đây không đọc phiên và không chấp nhận vai khác `manager`. Giới hạn 120 yêu cầu mỗi phút theo header `Authorization` (429 khi vượt).

**Errors chung:** 401 `UNAUTHORIZED` (thiếu hoặc sai token, `azp` sai, HTX của token không có); 403 `INTERNAL_GATEWAY_REQUIRED` (thiếu header của gateway) hoặc `FORBIDDEN` (token dịch vụ, thiếu `htx_code`, không phải `manager`); 429 từ gateway.

#### `GET /api/internal/apps/sales/sellable-lots`
Như `GET /api/sales/sellable-lots`, cho HTX của token. **Response:** `{ "data": [ { "lot_id", "lot_code", "dry_grade", "quality_grade", "capacity_g", "remaining_g" } ] }`.

#### `POST /api/internal/apps/sales/retail-orders`
Ghi đơn lẻ của mini-app và trừ tồn lô. **Request:**
```json
{ "external_ref": "7f3c...", "customer_name": "Nguyễn Văn A", "ordered_on": "2026-11-28",
  "lines": [ { "lot_id": "cuid", "pack_count": 4, "pack_net_g": 250, "amount_vnd": 400000 } ] }
```
`external_ref` khớp `^[A-Za-z0-9_-]{1,64}$` (mã đơn của mini-app); `customer_name` 1 đến 100 ký tự, tuỳ chọn; `ordered_on` được chấp nhận nhưng bị bỏ qua (đơn luôn đặt hôm nay); `lines` 1 đến 50 dòng: `pack_count` 1 đến 999, `pack_net_g` 1 đến 100.000 (gam), `amount_vnd` số nguyên không âm (số hoặc chuỗi số tối đa 13 chữ số). Số gam của dòng là `pack_count × pack_net_g`. Khoá lạ bị từ chối.

**Response:** 201 `{ "data": <đơn RETAIL, source TEA_SHOP> }`; **200** với đơn đầu tiên khi `external_ref` đã có (gửi lại không trừ tồn thêm).

**Errors:** 400 `VALIDATION_ERROR`; 404 `NOT_FOUND` (lô không thuộc HTX); 409 `LOT_STOCK_SHORT` (kèm `error.stock`); 422 `LOT_NOT_SELLABLE`; cùng lỗi chung ở trên.

#### `POST /api/internal/apps/sales/retail-orders/[external_ref]/cancel`
Huỷ đơn lẻ theo `external_ref`; phần đã bán của lô quay về tồn. **Request:** `{ "reason": "..." }` (3 đến 200 ký tự, tuỳ chọn; thiếu thì lý do là "Huỷ từ gian hàng"). **Response:** `{ "data": <đơn> }`; huỷ lần hai trả đúng đơn đã huỷ, không lỗi. **Errors:** 400 `VALIDATION_ERROR` (`external_ref` sai dạng); 404 `NOT_FOUND` (không có đơn đó); 409 `ORDER_HAS_PAYMENTS` (đơn đã có khoản thu); cùng lỗi chung ở trên.

### `GET /api/reports/season.csv`
Một phần của báo cáo vụ/năm dưới dạng CSV (UTF-8 có BOM), `Content-Disposition: attachment; filename="bao-cao-<section>-<from>_<to>.csv"`. **Vai:** `manager`, `accountant`. **Query bắt buộc:** `from`, `to` (ngày thật, `from` không sau `to`, tối đa ba năm = 1.098 ngày), `section` (`members`, `purchases`, `member_money`, `processing`, `lots`, `sales`, `safety`). Cột tiếng Việt, mỗi phần một bảng. **Errors:** 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`; **503 `SECTION_UNAVAILABLE`** ("Phần này chưa có dữ liệu để xuất") khi phần đó không tải được hoặc chưa có bảng xuất.

### Trang báo cáo (không phải route API)
`/manager/reports` và `/accountant/reports` chọn kỳ (năm nay, năm trước hoặc khoảng tự chọn); `/manager/reports/view?from=&to=` và `/accountant/reports/view?from=&to=` dựng báo cáo khổ A4. Kỳ sai hiện thông báo tại trang ("Chọn ngày bắt đầu và ngày kết thúc.", "Ngày không hợp lệ.", "Ngày kết thúc phải sau hoặc cùng ngày bắt đầu.", "Báo cáo tối đa ba năm."), vai khác bị chuyển về `/login`. Báo cáo gồm bảy phần (thành viên; thu mua búp; tiền xã viên; chế biến; lô và chứng nhận; bán hàng; an toàn), phần lỗi hiện "Chưa tải được phần này".

---

## Error Codes

| HTTP | code | Meaning |
|------|------|---------|
| 400 | VALIDATION_ERROR | Zod schema failed |
| 401 | UNAUTHORIZED | No valid session |
| 403 | FORBIDDEN | Wrong role for this route |
| 403 | NO_HTX | Tài khoản chưa gắn với HTX nào |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Duplicate (e.g., lot_code, parcel_code, tên phẩm cấp) |
| 409 | PARCEL_IN_WITHDRAWAL | Nương còn trong cách ly, không cân được; kèm `safe_from` (GĐ1 S3) |
| 409 | NO_PRICE_TODAY | Phẩm cấp chưa có giá hôm nay (GĐ1 S3) |
| 409 | TICKET_SETTLED | Phiếu cân đã vào kỳ quyết toán, không huỷ được (GĐ1 S3) |
| 409 | TICKET_VOIDED | Phiếu cân đã huỷ (GĐ1 S3) |
| 409 | ADVANCE_SETTLED, ADVANCE_VOIDED | Phiếu ứng đã quyết toán hoặc đã huỷ (GĐ1 S4) |
| 409 | ITEM_EXISTS | Trùng tên vật tư trong HTX (GĐ1 S4) |
| 409 | PERIOD_CLOSED, PERIOD_CHANGED | Kỳ đã chốt; số liệu kỳ đổi từ lúc xác nhận, kèm `totals` (GĐ1 S4) |
| 409 | NOTHING_TO_PAY, ALREADY_PAID | Dòng không có khoản chi trả; đã ghi trả (GĐ1 S4) |
| 409 | BATCH_NOT_OPEN, TICKETS_CHANGED | Mẻ đã hoàn thành hoặc đã huỷ; phiếu cân vừa đổi trạng thái (GĐ2) |
| 409 | TICKET_IN_BATCH | Phiếu cân đã vào mẻ sao, không huỷ được (GĐ2) |
| 409 | STOCK_CHANGED | Tồn chè khô đổi từ lúc chọn, kèm `stock` (GĐ2) |
| 409 | CERTIFICATE_REVOKED | Chứng nhận đã thu hồi (GĐ2) |
| 409 | LOT_STOCK_SHORT, OVERPAYMENT | Lô không còn đủ để bán, kèm `stock`; khoản thu vượt số còn phải thu, kèm `outstanding_vnd` (GĐ3) |
| 409 | ORDER_CANCELLED, ORDER_PAID, ORDER_HAS_PAYMENTS | Đơn đã huỷ; đơn đã thu đủ; đơn có khoản thu không huỷ được (GĐ3) |
| 422 | DOMAIN_ERROR | Business rule violated (e.g., approve already-approved entry) |
| 422 | WITHDRAWAL_BELOW_FLOOR | Số ngày cách ly thấp hơn mức sàn của thuốc (GĐ1 S1) |
| 422 | BATCH_EMPTY, DEVIATION_NOTE_REQUIRED | Mẻ chưa có phiếu hoặc sản lượng; tỷ lệ ngoài khoảng chuẩn thiếu giải trình (GĐ2) |
| 422 | GRADE_MISMATCH, WITHDRAWAL_NOT_PASSED | Dòng tồn khác hạng với lô; phiếu nguồn chưa qua cách ly (GĐ2) |
| 422 | LOT_NOT_SELLABLE, NOT_WHOLESALE | Lô chưa xuất QR hoặc chưa có khối lượng; chỉ đơn sỉ mới có hạn thanh toán (GĐ3) |
| 422 | LOT_WITHOUT_BATCH, CERTIFICATE_NOT_VALID | Lô không có nguồn mẻ; chứng nhận hết hạn, thu hồi hoặc không thuộc HTX (GĐ2) |
| 503 | SECTION_UNAVAILABLE | Phần báo cáo chưa có dữ liệu để xuất CSV (GĐ3) |
| 400 | FILE_TOO_LARGE, FILE_TYPE | Tệp chứng nhận quá 10 MB hoặc không phải PDF, JPG, PNG (GĐ2) |
| 500 | INTERNAL_ERROR | Unhandled server error |
| 503 | AI_UNAVAILABLE | Ollama or FastAPI not responding |

```json
{
  "error": {
    "code": "DOMAIN_ERROR",
    "message": "Journal entry is already approved",
    "details": { "entry_id": "uuid", "current_status": "approved" }
  }
}
```

## Telegram chat assistant (M5, internal)

Các route dưới đây không dành cho trình duyệt. Chúng dùng chung bảo vệ biên gateway với các route nội bộ khác.

### Cập nhật từ relay: `POST /api/internal/telegram/updates`

Ngoài `message_id`, `chat`, `from`, `text`, tin nhắn có thể kèm:
- `caption`: chú thích của ảnh; được xử lý như tin nhắn chữ khi không có phiên nào đang chờ ảnh, bị bỏ qua trong bước nhận ảnh;
- `photo`: `{ "mime_type": "image/jpeg", "data_base64": "...", "file_unique_id": "..." }`, ảnh lớn nhất không quá 5 MB;
- `photo_error`: `too_large` hoặc `download_failed` khi có ảnh nhưng không chuyển tiếp được;
- `location`: `{ "latitude": number, "longitude": number }`;
- `voice_text`: câu relay nghe được từ tin thoại (tối đa 500 ký tự, không bao giờ là âm thanh). Web trả `Em nghe được: “…”` kèm ba nút `Đúng`, `Sửa`, `Huỷ` và giữ câu trong cuộc hội thoại loại `voice` 10 phút; chỉ `Đúng` mới chuyển câu đó đi như tin nhắn chữ, nên việc ghi vẫn cần thẻ xác nhận. Văn bản rỗng trả `Chưa nghe rõ. Bạn nói lại hoặc nhắn chữ nhé.` không kèm nút;
- `voice_duration`: số giây của tin thoại (0 đến 3600);
- `voice_error`: `too_long` (tin thoại dài quá 60 giây) hoặc `stt_unavailable` (dịch vụ nhận dạng không chạy hoặc lỗi); web trả câu giải thích, không giữ gì.

### Trả lời cho relay: `op`

Mỗi trả lời là `{ op: 'send', chat_id, text, buttons?, audio? }` hoặc `{ op: 'edit', chat_id, edit_message_id, text, buttons? }`. `buttons` là mảng hàng, mỗi nút có `text` và `callback_data`. Một lần `edit` không có `buttons` sẽ xoá bàn phím. `audio: { kind: 'bulletin', id }` (chỉ có ở `send`) bảo rơle lấy tệp tại `GET /api/internal/telegram/media?bulletin=<id>` rồi gửi bằng `sendDocument` (`ban-tin.wav`, `text` làm chú thích); không lấy được thì rơle gửi `Chưa đọc được bản tin lúc này.`.

### Callback dữ liệu v2

`v2|<c>|<s>|<sig>`: `c` là `menu` hoặc mã 11 ký tự của bước hiện tại, `s` là bước của nút (ví dụ `o3`, `skip`, `ok`, `next`, `final`, `cancel`), `sig` là 12 byte đầu của HMAC-SHA256 khoá callback, mã hoá base64url (16 ký tự). Tổng tối đa 48 byte. Nút của bước cũ bị từ chối với `staleButton`.

### `POST /api/internal/agent/assistant/claim`

Agent claim tối đa 5 yêu cầu (mặc định 3) của HTX. Trả về `{ "requests": [{ id, text, role, today, tools, actions }] }` với `tools` và `actions` là danh sách đầy đủ (`name`, `title_vi`, `args`).

### `POST /api/internal/agent/assistant/requests/{id}/result`

Body `{ "intent": { type, name?, args? }, "run_id": uuid | null }`. Trả về `200 { ok: true }`; `404` cho HTX khác hoặc id lạ; `409` khi yêu cầu không ở trạng thái `claimed`. Intent không hợp lệ được coi là `unknown`.

### Hết hạn

`GET /api/internal/telegram/outbox` trước khi giao hàng đợi đánh dấu các yêu cầu `pending` hoặc `claimed` cũ hơn 60 giây là `expired`, rồi xếp lời trả lời `assistantTimeout` kèm menu vào đúng chat.


## Telegram Mini App (M6)

Mini App chỉ bật khi web có `DXOS_TELEGRAM_WEBAPP_KEY` (hex của `HMAC_SHA256(key="WebAppData", msg=<bot token>)`, do `./dxos telegram enable` ghi). Web không bao giờ giữ bot token.

- **`POST /api/telegram/webapp/session`** (cần phiên đăng nhập): body `{ "init_data": "<initData thô>" }`. Web kiểm `hash` theo thuật toán của Telegram (so sánh thời gian hằng), `auth_date` không quá 24 giờ, có `user.id`, và `user.id` phải bằng `telegram_user_id` của liên kết còn hiệu lực của người đang đăng nhập. `initData` không bao giờ là đăng nhập.
  - `200 { "data": { "telegram_user_id": n } }` và đặt cookie `dxos_tg_webapp` (`httpOnly`, `SameSite=Lax`, 12 giờ, giá trị `<telegram_user_id>.<user_id>.<hết hạn>.<chữ ký>`, ký bằng `AUTH_SECRET`).
  - `404 WEBAPP_DISABLED` (thiếu khóa dẫn xuất), `401` (không có phiên), `400 WEBAPP_INVALID` (hash sai, quá hạn, thiếu `user`, body sai), `403 WEBAPP_NOT_LINKED` (Telegram của người khác hoặc chưa liên kết).
- Vì Content-Security-Policy chưa được đặt ở đâu trong web, không có chính sách nào cần đổi; script `https://telegram.org/js/telegram-web-app.js` chỉ được tải khi mở trong Telegram.
- **Trang `/telegram/open`** (cần phiên; khách chưa đăng nhập được chuyển tới `/login?callbackUrl=/telegram/open?...` và quay lại sau khi đăng nhập): gửi `initData` tới route trên một lần, rồi chuyển tới `?to=<đường dẫn>` nếu đó là đường dẫn cùng nguồn thuộc danh sách của vai trò (`/farmer/journal/new`; `/officer/journal`, `/officer/households`, `/officer/farm-zones`; `/manager/ai`, `/manager/journal-approve`), nếu không thì tới trang chủ của vai trò. Ngoài Telegram hoặc khi `WEBAPP_DISABLED` trang chỉ chuyển hướng; khi `403` trang hiện lý do.
- `TelegramWebAppShell` (layout gốc) chỉ hoạt động khi URL có `tgWebAppData` hoặc `tgWebAppPlatform` (cờ lưu trong `sessionStorage`); khi đó mới tải `https://telegram.org/js/telegram-web-app.js`, gọi `ready()` và `expand()`, đặt `data-theme` theo `colorScheme` của Telegram và nối nút Back với `router.back()` khi `history.length > 1`.
- **Nút Mini App trong chat (M6)**, chỉ hiện khi web có `DXOS_WEB_PUBLIC_URL` bắt đầu bằng `https://` (không thì chat giữ nguyên): menu có thêm hàng `Mở ứng dụng` (nút `web_app` tới `/telegram/open`, mọi vai trò); thẻ xác nhận `journal.create` của nông dân có thêm nút `Sửa` mở `/farmer/journal/new?parcel&activity&product&dosage&withdrawal` đã điền sẵn; tin đề xuất mức `high` có thêm nút `Mở chi tiết` tới `/manager/ai?proposal=<id>`. Cán bộ và `harvest.approve` chưa có biểu mẫu riêng nên không có nút `Sửa`. Hàng đợi gửi nhận thêm loại nút `{ text, web_app: { url } }`.

## Hành động của mini-app (M9)

- **`POST /api/internal/agent/proposals`** nhận thêm `agent: "app:<id>"` (`^app:[a-z0-9][a-z0-9-]{0,39}$`) và `kind: "app.<id>.<action>"`. Loại này chỉ được nhận khi ứng dụng đã cài và đang bật cho HTX của token; ngược lại `400 UNKNOWN_KIND`. Tải trọng phải khớp lược đồ khai báo trong `agent.actions[].payload` của `app.yaml` (`400 INVALID_PAYLOAD`), cộng `_labels` (chuỗi → chuỗi, tùy chọn). Bằng chứng dùng bảng `app:<id>` (hàng do ứng dụng khai; chỉ hành động của chính ứng dụng đó được trích); các `id` của hàng này là chủ thể để chống trùng 24 giờ. Câu trả lời không đổi.
- **Danh mục động.** `getAction(kind, htxCode)` đọc `platform.installed_apps.manifest.agent` và `platform.app_enablements`, lưu 60 giây (xóa khi cài hoặc gỡ qua `./dxos`, nên thay đổi có hiệu lực trong tối đa 60 giây). `risk`, `approver_roles`, `title_vi` lấy từ manifest; `autonomy` là `unlockable` khi `money: true` (cửa sổ tự chạy 2 giờ), ngược lại `auto`; hết hạn sau 72 giờ; không có trường chỉnh sửa.
- **Duyệt = thực thi.** `POST /api/agent/proposals/{id}/decide` (và nút Telegram) gọi `POST {CORE_GATEWAY_URL}/apps/<id><path>` với token `client_credentials` của `dxos-apps-actor` (bí mật `DXOS_APPS_ACTOR_SECRET` trong môi trường hoặc `/run/dxos-web/roles.env`, ghi bởi `./dxos apps actor enable`) và ba header `X-DXOS-Acting-Sub`, `X-DXOS-Acting-Role`, `X-DXOS-Acting-Htx`; thân là tải trọng bỏ `_labels`. 2xx → `executed` với `result: { result: <JSON của ứng dụng> }`; 4xx → `failed` kèm `message_vi` của ứng dụng; lỗi khác → `failed` với thông báo chung. Chưa có bí mật → `failed` với thông báo yêu cầu quản trị viên bật.
- **Gỡ hoặc tắt ứng dụng.** Mọi đề xuất `proposed` có `kind` `app.<id>.%` của ứng dụng không còn cài hoặc không còn bật cho HTX chuyển sang `expired` (sự kiện kiểm toán `agent.proposal.expired`, `reason` là `app_removed` hoặc `app_disabled`), chạy mỗi lần danh mục nạp lại. Quyết định muộn trên đề xuất đó trả `{ outcome: "expired" }` và không gọi ứng dụng.

## Xưởng mini-app (M13)

Trưởng HTX nhờ AI làm app; A12 chọn cách rẻ nhất (app trong Kho, mẫu Sổ tự tạo, hoặc viết app mới). Mọi lỗi dự kiến trả `{ error: { code, message } }`.

### Trưởng HTX (phiên đăng nhập, vai trò `manager`)

- **`POST /api/agent/app-requests`**: `{ request_text }` (5 đến 500 ký tự) → `201 { data: { id, status: "new" } }`. HTX và người gửi lấy từ phiên. `409 REQUEST_ACTIVE` khi HTX đang có yêu cầu ở `new`, `asking`, `spec_proposed`, `spec_approved` hoặc `building`.
- **`POST /api/agent/app-requests/{id}/answer`**: `{ answer_text }` (1 đến 1000 ký tự) cho yêu cầu `asking` chưa có câu trả lời; `409 WRONG_STATE` nếu không còn chờ. Trên Telegram, tin nhắn kế tiếp của người gửi (cuộc hội thoại `app_answer`, 24 giờ) có tác dụng như vậy.
- **`POST /api/agent/app-requests/{id}/cancel`**: đóng yêu cầu ở `new`, `asking`, `spec_proposed`.
- **`GET /api/agent/app-requests/{id}/files/{name}`**: ảnh chụp (`desktop-light.png`, `desktop-dark.png`, `mobile-light.png`, `mobile-dark.png`), `review.md` hoặc `spec.md` của bản xây mới nhất.
- Trang `/manager/ai/apps` (biểu mẫu, danh sách, câu hỏi) và `/manager/ai/apps/{id}` (đặc tả, bảng cổng kiểm tra, báo cáo AI thứ hai, bốn ảnh chụp, nút duyệt đặc tả).
- Telegram: câu có `cần app`, `làm app`, `xây app` hoặc `cần phần mềm` của trưởng HTX tạo yêu cầu (`Đã nhận yêu cầu. Trợ lý sẽ hỏi lại vài câu nếu cần.`); đã có yêu cầu mở thì trả `HTX đang có một yêu cầu xây app chưa xong.`.

### A12 (token `agent`, phạm vi `htx_code` của token; mọi đường dẫn nằm dưới `/api/internal/agent/`)

- **`GET /api/internal/agent/app-builder/requests`** → `{ data: { requests } }`: yêu cầu `new`; `asking` đã có câu trả lời; `passed` hoặc `failed` mà `announced_at` còn trống. Yêu cầu đang mở có `{ id, status, request_text, questions, answer_text, store_apps: [{ id, name_vi, description_vi, enabled }], book_templates, custom_books_enabled, code_providers }`; yêu cầu đã xong chỉ có `{ id, status }`. `store_apps` không có app của HTX khác.
- **`POST …/requests/{id}/questions`**: `{ questions }` (1 đến 5, mỗi câu tối đa 160 ký tự) → `asking`; gửi một tin Telegram và mở hội thoại `app_answer`.
- **`POST …/requests/{id}/route`**: `{ path: "store" | "book", target, reason_vi (≤ 300) }` → `routed` và `{ data: { proposal_id } }`. `store`: đề xuất `miniapp.install` của `target`. `book`: đề xuất `app.custom-books.book.create` (mẫu `target`), hoặc `miniapp.install` của `custom-books` khi chưa bật.
- **`POST …/requests/{id}/spec`**: thân là đặc tả (`app_id` `^gen-[a-z0-9-]{3,27}$`, `name_vi`, `summary_vi`, `roles` 1 đến 3, `screens` 1 đến 8, `data` 0 đến 5 bảng, `agent_reads` 0 đến 5; không có chỗ cho hành động) → `201 { data: { proposal_id } }`, đề xuất `app.spec.approve`. `409 APP_ID_TAKEN` khi mã có trong danh mục, trong `app_builds` hoặc ở yêu cầu khác.
- **`POST …/requests/{id}/announce`**: thân rỗng. Khi `passed`: xếp tin `App "<tên>" đã xây xong, qua 7 cổng kiểm tra.` kèm 4 ảnh và tạo đề xuất `miniapp.install` (`agent: app-builder`) → `{ data: { proposal_id } }`. Khi `failed`: xếp tin `Chưa xây được app "<tên>": <lỗi>. Yêu cầu đã đóng.` → `{ data: { proposal_id: null } }`. Gọi lần hai không làm gì thêm (`announced_at`).

### Hành động (danh mục)

| Loại | Rủi ro, tự chạy | Tải trọng | Thực thi |
|---|---|---|---|
| `app.spec.approve` | medium, `auto` | `{ request_id }` | `spec_proposed` → `spec_approved`; cũ khi đặc tả hoặc trạng thái đổi |
| `miniapp.install` | high, `unlockable` | `{ app_id }` | yêu cầu `ENABLE` của Kho cho HTX của đề xuất; app `gen-*` chỉ khi `owner_htx` là HTX đó, bản xây `passed` và đặc tả đã duyệt (từ chối khi tạo và khi chạy: `Bản này chưa qua kiểm tra hoặc không thuộc HTX này`) |
| `miniapp.remove` | high, `unlockable` | `{ app_id }` | yêu cầu `DISABLE` của Kho |

### Telegram

- `GET /api/internal/telegram/outbox`: mỗi mục có thể có `photos: [{ build_id, name }]` (tối đa 4).
- `GET /api/internal/telegram/media?build=<uuid>&name=<n>` (token relay): một trong bốn ảnh PNG của bản xây; `400` cho tên khác, `404` khi không có.
- `GET /api/internal/telegram/media?bulletin=<uuid>` (token relay): bản tin đã đăng đọc thành tiếng, `audio/wav` (Piper, tối đa 2.000 ký tự đã bỏ markdown); `400` cho mã không phải uuid, `404` khi không có bản tin hoặc bản tin rỗng, `503` khi Piper không chạy.

### Gọi API chẩn đoán không có phiên (issue #80)

`POST /api/internal/web/disease/predict?model=<tea|general>` (multipart `file`): route của cổng, chỉ trên cổng nội bộ 9081, chuyển tới `disease-api` như `/api/ai/disease/*`. Chỉ nhận token của client `dxos-web-service` (vai trò `web-service`, audience `dx-os-core`); token của người dùng, agent, rơle và app nhân sự bị từ chối, và các route của người dùng từ chối token này. Web dùng nó để chẩn đoán ảnh gửi qua Telegram (`disease.report`).

### Kho ứng dụng

Danh mục có `owner_htx` chỉ hiện cho HTX đó (danh sách, chi tiết `404` cho HTX khác). Thẻ và trang chi tiết có `generated: true` và `buildRequestId`, hiển thị `App do AI xây` kèm liên kết tới `/manager/ai/apps/<request id>`.
