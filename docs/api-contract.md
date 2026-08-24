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

**Query:** `?commodity=rice` (optional, defaults to HTX primary crop)

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "commodity": "rice",
    "bulletin_vi": "Thị trường lúa gạo tuần này...",
    "sources_json": [
      { "source": "USDA", "metric": "export_volume", "value": 850, "unit": "USD/tonne", "date": "2026-08-01" }
    ],
    "audio_minio_key": "bulletins/rice-2026-08-04.mp3",
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
{ "text": "Thị trường lúa gạo tuần này...", "lang": "vi" }
```

**Response:**
```json
{ "data": { "audio_url": "/api/tts/stream?key=bulletins/rice-2026-08-04.mp3" } }
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
  "message": "Giá xuất khẩu gạo tháng 8 so với tháng 7 thế nào?",
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
    "reply": "Theo dữ liệu USDA ngày 01/08, giá FOB xuất khẩu gạo Việt Nam...",
    "sources": ["USDA PSD 2026-08-01", "Frankfurter 2026-08-04"],
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
      "name": "Cty TNHH Lúa Gạo Bình An",
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
      "current_crop": "Lúa Hè Thu"
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
  "current_crop": "Lúa Hè Thu",
  "soil_type": "Đất phù sa",
  "irrigation_type": "Tưới tràn"
}
```

### `PUT /api/farm/parcels/[id]`
Update parcel. Partial body accepted.

### `DELETE /api/farm/parcels/[id]`
Delete parcel. **Roles:** officer, manager.

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
      "growth_stage": "Đẻ nhánh",
      "observation": "Lúa sinh trưởng tốt",
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
  "growth_stage": "Đẻ nhánh",
  "observation": "Lúa sinh trưởng tốt",
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
      "lot_code": "HTXA-RICE-20260804-001",
      "crop": "Lúa Hè Thu",
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
  "crop": "Lúa Hè Thu",
  "harvest_date": "2026-08-04",
  "estimated_weight_kg": 2500,
  "parcel_ids": ["uuid1", "uuid2"],
  "packaging_type": "Túi 25kg",
  "destination": "Cty TNHH Lúa Gạo Bình An",
  "buyer_name": "Nguyễn Văn Mua",
  "certificate_keys": ["cert/uuid.pdf"]
}
```
*`lot_code` auto-generated: `{htx_code}-{CROP}-{YYYYMMDD}-{NNN}`*

### `GET /api/lots/[id]`
Get lot detail with traceability data (all linked journal entries, parcels, weather).

### `POST /api/lots/[id]/export-qr`
Generate QR code + snapshot public page data. **Roles:** officer, manager.

**Response:**
```json
{
  "data": {
    "lot_code": "HTXA-RICE-20260804-001",
    "qr_image_url": "https://minio.../qr/HTXA-RICE-20260804-001.png",
    "public_page_url": "https://domain/lot/HTXA-RICE-20260804-001"
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

**robots.txt:** `Disallow: /lot/`

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
    "submitted_at": "2026-08-04T14:00:00Z"
  }
}
```

> **AI Invariant:** Response contains disease NAME + CONFIDENCE only. No treatment recommendation.

**Roles:** farmer, officer

---

## FastAPI — Disease Classifier Service

**Internal URL (Docker network):** `http://disease-api:8000`
**Called by:** Next.js `/api/diagnosis` route ONLY (not directly by browser)

### `GET /health`
Health check.
```json
{ "status": "ok", "model_loaded": true }
```

### `POST /predict`
Classify crop disease from image.

**Request:** `multipart/form-data`
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
  ]
}
```

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
