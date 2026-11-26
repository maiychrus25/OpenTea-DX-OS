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

- **`GET /api/internal/agent/campaigns/candidates?day=YYYY-MM-DD`**: trả về `{ day, proposals, rain_parcel_codes, withdrawal_parcel_codes, people_available }`. `proposals` là đề xuất `proposed` chưa hết hạn, mỗi mục có `id`, `kind`, `risk`, `title_vi`, `created_at`, `parcel_codes`, `goal_key`, `target`, `involves_spraying` (luôn `false`), `people_needed` (luôn `0`). `rain_parcel_codes` là thửa có dự báo từ 5 mm mưa; `withdrawal_parcel_codes` là thửa còn trong thời gian cách ly phun thuốc của ngày đó. `people_available` là `null` cho tới M10.
- **`POST /api/internal/agent/campaigns`**: `{ day, items: [{ proposal_id, position }], dropped: [{ proposal_id, rule }], summary_vi, run_id }`. `position` phải là 1..n theo thứ tự; `rule` là `withdrawal`, `rain`, `people` hoặc `overflow`. Web tính lại `goal_key` và `target` từ đề xuất, không tin giá trị agent gửi. `201 { id }` khi tạo mới; `200 { existing: true, id }` khi HTX đã có chiến dịch của ngày đó (không gửi Telegram lần nữa). `400 INVALID_CAMPAIGN` khi một đề xuất không còn `proposed` hoặc không thuộc HTX; `400 INVALID_RUN_ID` khi `run_id` không thuộc HTX. Danh sách `dropped` chỉ ghi vào sự kiện kiểm toán `agent.campaign.created`.

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

- **`GET /api/internal/agent/improvements/inputs?week=YYYY-MM-DD`** (thứ Hai): trả về `{ data: { week, settings, proposal_stats, journal_review, campaign_goals, improvements, metrics } }`.
  - `settings`: ngưỡng và giờ báo cáo của từng agent có dòng cài đặt.
  - `proposal_stats`: đề xuất đã quyết định trong 28 ngày, nhóm theo `agent`, `kind`, `template`, với `approved`, `rejected`, `expired`, `median_wait_hours`.
  - `journal_review`: `reviewed` và `returned_missing_info` trong 28 ngày.
  - `campaign_goals`: số ngày và số ngày trượt mục tiêu trong 14 ngày gần nhất (`actual < target`).
  - `improvements`: cải tiến của 8 tuần gần nhất.
  - `metrics`: giá trị hiện tại của từng `metric_key` trong `improvements`; khóa không có số liệu không có giá trị.
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

## Telegram chat assistant (M5, internal)

Các route dưới đây không dành cho trình duyệt. Chúng dùng chung bảo vệ biên gateway với các route nội bộ khác.

### Cập nhật từ relay: `POST /api/internal/telegram/updates`

Ngoài `message_id`, `chat`, `from`, `text`, tin nhắn có thể kèm:
- `caption`: chú thích của ảnh (không dùng để định tuyến);
- `photo`: `{ "mime_type": "image/jpeg", "data_base64": "...", "file_unique_id": "..." }`, ảnh lớn nhất không quá 5 MB;
- `photo_error`: `too_large` hoặc `download_failed` khi có ảnh nhưng không chuyển tiếp được;
- `location`: `{ "latitude": number, "longitude": number }`.

### Trả lời cho relay: `op`

Mỗi trả lời là `{ op: 'send', chat_id, text, buttons? }` hoặc `{ op: 'edit', chat_id, edit_message_id, text, buttons? }`. `buttons` là mảng hàng, mỗi nút có `text` và `callback_data`. Một lần `edit` không có `buttons` sẽ xoá bàn phím.

### Callback dữ liệu v2

`v2|<c>|<s>|<sig>`: `c` là `menu` hoặc mã 11 ký tự của bước hiện tại, `s` là bước của nút (ví dụ `o3`, `skip`, `ok`, `next`, `final`, `cancel`), `sig` là 12 byte đầu của HMAC-SHA256 khoá callback, mã hoá base64url (16 ký tự). Tổng tối đa 48 byte. Nút của bước cũ bị từ chối với `staleButton`.

### `POST /api/internal/agent/assistant/claim`

Agent claim tối đa 5 yêu cầu (mặc định 3) của HTX. Trả về `{ "requests": [{ id, text, role, today, tools, actions }] }` với `tools` và `actions` là danh sách đầy đủ (`name`, `title_vi`, `args`).

### `POST /api/internal/agent/assistant/requests/{id}/result`

Body `{ "intent": { type, name?, args? }, "run_id": uuid | null }`. Trả về `200 { ok: true }`; `404` cho HTX khác hoặc id lạ; `409` khi yêu cầu không ở trạng thái `claimed`. Intent không hợp lệ được coi là `unknown`.

### Hết hạn

`GET /api/internal/telegram/outbox` trước khi giao hàng đợi đánh dấu các yêu cầu `pending` hoặc `claimed` cũ hơn 60 giây là `expired`, rồi xếp lời trả lời `assistantTimeout` kèm menu vào đúng chat.


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

### Kho ứng dụng

Danh mục có `owner_htx` chỉ hiện cho HTX đó (danh sách, chi tiết `404` cho HTX khác). Thẻ và trang chi tiết có `generated: true` và `buildRequestId`, hiển thị `App do AI xây` kèm liên kết tới `/manager/ai/apps/<request id>`.
