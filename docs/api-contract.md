# API Contract — DX-AgriMarket

**Base URL (local):** `http://localhost:3000/api`
**Base URL (prod):** `https://{domain}/api`
**Auth:** Bearer token (NextAuth.js session cookie) — all routes except `/lot/[code]` public page
**Response format:** `{ data: T }` success · `{ error: { code, message } }` error
**Validation:** Zod at route handler layer, before UseCase

---

## Auth

### `GET /api/auth/session`
Returns current session (NextAuth built-in).
```json
{ "user": { "id": "uuid", "email": "...", "role": "manager|officer|farmer", "name": "..." } }
```

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

### `GET /api/partners`
List all partners with map coordinates.

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
Create new partner.

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
Update partner. Same body as POST (partial OK).

### `DELETE /api/partners/[id]`
Delete partner. **Roles:** manager only.

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

### `GET /lot/[lotCode]`
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
Read latest market data from PostgreSQL (written by n8n).

**Query:** `?commodity=rice&source=usda_psd&metric=export_volume`

**Response:**
```json
{
  "data": [
    {
      "source": "usda_psd",
      "commodity": "rice",
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
- **Public paths** (start with a `routes.public` prefix of the manifest, e.g. `/apps/tea-tour/public/...`): no token is sent; 10 requests per minute per client IP (first `x-forwarded-for` element, counted across every app), then 429. Once 10,000 IPs are tracked in the window, new IPs share one `overflow` bucket with the same limit.
- **Protected paths** (everything else): the user's Keycloak access token is sent as `Authorization: Bearer <token>`; the gateway checks it and the manifest roles (401/403 from the gateway are passed through). With no session or token, the proxy answers 401 with a short Vietnamese HTML page whose sign-in link is `<a href="/login" target="_top">`.
- **Request:** method, body (streamed), query string, `content-type`, `accept` and `content-length` are forwarded; nothing else, so the browser's `cookie`, `authorization` and `x-hasura-*` headers never reach the gateway. Redirects are not followed (`redirect: manual`); timeout 10 s, then 503.
- **Response:** status, body (streamed), `content-type` and `location` only; `set-cookie` and every other app header are dropped. A `location` is kept only when it resolves to the same origin under `/apps/<id>`; any other redirect answers 502 with no `location`. Every response, including the proxy's own 400/401/404/429/502/503, adds `Content-Security-Policy: default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'self'` and `X-Content-Type-Options: nosniff`.

Next.js removes a trailing slash with a 308 before the route runs, so `/apps/<id>/` becomes `/apps/<id>`, which is forwarded as `/apps/<id>/`.

---

## Error Codes

| HTTP | code | Meaning |
|------|------|---------|
| 400 | VALIDATION_ERROR | Zod schema failed |
| 401 | UNAUTHORIZED | No valid session |
| 403 | FORBIDDEN | Wrong role for this route |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Duplicate (e.g., lot_code, parcel_code) |
| 422 | DOMAIN_ERROR | Business rule violated (e.g., approve already-approved entry) |
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
