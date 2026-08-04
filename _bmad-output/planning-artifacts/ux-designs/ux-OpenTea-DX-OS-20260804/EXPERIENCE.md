---
name: DX-AgriMarket
status: final
updated: 2026-08-04
sources:
  - _bmad-output/planning-artifacts/prd-dx-agrimarket-20260804/prd.md
  - _bmad-output/planning-artifacts/architecture-dx-agrimarket-20260804/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-OpenTea-DX-OS-20260804/DESIGN.md
---

# DX-AgriMarket — Experience Spine

> Multi-surface responsive web app (PWA-capable). Three distinct role UIs sharing a single codebase. Primary surface: mobile-first (Manager + Farmer), with a secondary desktop-optimized surface (Officer map workflow). No native mobile app — Progressive Web App strategy for field use.

---

## Foundation

**Form factor:** Responsive web app. Mobile-first. No native shell.
- **Manager:** Primarily mobile (360–430px viewport). Desktop supported for bulletin reading and chatbot.
- **Officer:** Primarily desktop/laptop (`lg+` 1024px+) for Farm Zone Map drawing and batch journal review. Also functions on tablet.
- **Farmer:** Mobile-only UX assumption (375px primary). Single-column, bottom navigation, large tap targets.
- **Public QR Scan Page:** Any device, no navigation chrome. Optimized for quick scanning in field/warehouse.

**UI system:** CSS Modules (no design system library). `DESIGN.md` is the visual identity reference. Component patterns in this spine are behavioral — visual specs live in `DESIGN.md.Components`.

**Role differentiation:** Role set at login via Keycloak OIDC token. Layout root receives `data-role="manager|officer|farmer"`. Farmer role inherits `body-large` font automatically. No shared screens between roles — each role has its own layout, navigation, and feature set.

**Language:** 100% Vietnamese UI. All AI output in Vietnamese. Citation data may include English source names (USDA, WTO, NASA) as proper nouns in otherwise Vietnamese sentences — this is correct, not an i18n error.

---

## Information Architecture

### Manager Role IA

| Surface | Route | Reached from | Purpose |
|---|---|---|---|
| Today Dashboard | `/manager/dashboard` | Login redirect | All-HTX overview: bulletin summary, lot count, quick links |
| Market Bulletin | `/manager/bulletin` | Sidebar nav | Daily full bulletin; TTS listen; AI citations |
| Market Chatbot | `/manager/chatbot` | Sidebar nav | Vietnamese Q&A on market prices; 7-day history |
| Partner Map | `/manager/partner-map` | Sidebar nav | Buyers/middlemen/warehouses CRUD on Leaflet |
| Farm Zone (read-only) | `/manager/farm-zone` | Sidebar nav | Full HTX parcel map, filter by status + crop |
| Lot List (read-only) | `/manager/lots` | Sidebar nav / notification deep-link | All lots view; filter by status |
| Announcements | `/manager/announcements/new` | Sidebar nav | Broadcast announcement to all |
| Notification Panel | Overlay (TopBar bell) | TopBar click | Personal notification list; read/unread; TTS per item |

Navigation: Left sidebar on `lg+`; bottom nav on mobile (Dashboard / Bulletin / Chatbot / Map / More→).

### Officer Role IA

| Surface | Route | Reached from | Purpose |
|---|---|---|---|
| Today Dashboard | `/officer/dashboard` | Login redirect | Action queue: pending journals, disease reports, overdue parcels |
| Farm Zone Map | `/officer/farm-zone` | Sidebar nav | Full CRUD: households, parcels, polygon draw, status view |
| Journal — My Entries | `/officer/journal` | Sidebar nav | Officer's own journal entries + create new entry |
| Journal — Pending | `/officer/journal/pending` | Sidebar nav / dashboard | Batch approve farmer-submitted entries |
| Lots | `/officer/lots` | Sidebar nav | Full CRUD lot workflow (6-step stepper) |
| Lot Detail | `/officer/lots/[id]` | Lots list / notification | Single lot; QR export step |
| Technical Chatbot | `/officer/chatbot` | Sidebar nav | Agronomy Q&A; RAG from MinIO documents |
| Document Store (PARA) | `/officer/documents` | Sidebar nav | MinIO PARA file manager |
| Disease Reports | `/officer/disease` | Dashboard / notification | All HTX disease records; confirm/correct diagnosis |
| Announcements | `/officer/announcements/new` | Sidebar nav | Technical announcement to specific farmer households |
| Notification Panel | Overlay | TopBar bell | Personal list |

Navigation: Left sidebar on `lg+`; bottom nav on mobile (Dashboard / Farm Zone / Journal / Lots / More→).

### Farmer Role IA

| Surface | Route | Reached from | Purpose |
|---|---|---|---|
| Today Dashboard | `/farmer/dashboard` | Login redirect | Parcel weather, crop price (mock), my parcels, notifications, quick links |
| Disease Diagnosis | `/farmer/diagnosis` | Dashboard button / bottom nav | Photo upload; AI result; send to officer |
| Disease History | `/farmer/diagnosis/history` | Dashboard link | Read-only: farmer's household disease records |
| Journal — My Entries | `/farmer/journal` | Bottom nav | Create, view, withdraw entries for own parcels |
| Notification Panel | Overlay | TopBar bell | Personal notification list; TTS per item |

Navigation: Bottom nav only (Today / Nhật ký / Chẩn đoán).

### Public Surface (No Auth)

| Surface | Route | Purpose |
|---|---|---|
| QR Scan Page | `/lot/[lotCode]` | Buyer-facing traceability: 4-block layout, no login |
| Login | `/login` | Keycloak OIDC redirect |

### Navigation Notes

- Sidebar items and bottom nav tabs are role-scoped — rendered from config, not conditionally hidden.
- `RoleGuard` middleware redirects to `/unauthorized` on role mismatch immediately — no flash.
- No inter-role navigation; deep-links from notifications always land within the correct role's IA.
- "More →" bottom nav item on Manager/Officer opens a sheet with less-frequent items.

---

## Voice and Tone

DX-AgriMarket speaks like a **trusted field advisor**, not a tech product. Direct, calm, specific. Never enthusiastic about its own capabilities. Data is always cited; opinion is never expressed.

| Context | Do | Don't |
|---|---|---|
| AI bulletin | "Giá lúa ST25 xuất khẩu ~20,400 đ/kg (FOB). (Nguồn: USDA, 03/08/2026)" | "Giá lúa đang tăng mạnh! Đây là cơ hội tốt!" |
| AI chatbot response | "Dữ liệu WTO cho thấy thuế EVFTA hiện tại là 0%." | "Theo tôi, bạn nên bán ngay bây giờ." |
| Withdrawal PASSED | "Đã qua thời gian cách ly (15/14 ngày). An toàn thu hoạch." | "✅ Tuyệt vời! Bạn có thể thu hoạch!" |
| Empty state | "Chưa có thửa đất nào. Bắt đầu bằng cách vẽ thửa đất đầu tiên." | "Oops! Nothing here yet!" |
| Error | "Không thể tải bản tin. Đang hiển thị dữ liệu thô." | "Something went wrong 😞" |
| Disease result | "AI nhận diện: Đạo ôn lá — Độ tin cậy 95%. Cần xác nhận từ Cán bộ KT." | "Chắc chắn đây là Đạo ôn lá! Hãy phun thuốc ngay!" |
| Action confirm | "Đã gửi cho Cán bộ KT." | "Success! Your report has been submitted!" |
| Notification | "Cán bộ Trần Văn B phê duyệt thu hoạch thửa A3 lúc 14:00 ngày 20/07." | "New notification from Officer" |

**AI Invariant microcopy rule:** Every AI-generated block must end with a citation line. Format: `(Nguồn: [SOURCE_NAME], [DD/MM/YYYY])`. Multiple sources: comma-separated. This rule applies to Bulletin blocks, Chatbot AI messages, and Disease diagnosis confidence display.

**Numbers:** Vietnamese locale formatting (dấu phẩy = decimal, dấu chấm = thousand separator). Example: `20.400 đ/kg`, not `20,400`. Exception: lot codes use hyphens per spec.

---

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use cases | Behavioral rules |
|---|---|---|
| **StatusBadge** | Parcel list, lot list, map popup, Today dashboard | Closed set (5 variants). Read-only — never a clickable control. |
| **NotificationBell** | TopBar (all roles) | On click: opens right-anchored overlay panel (not page nav). Badge count resets to 0 on open. SSE/polling updates count in real time. |
| **NotificationPanel** | TopBar overlay | List of notifications, newest first. Each row: icon + title + timestamp + TTS button. Mark-all-read button at top. Scroll within panel (max height 480px). |
| **TTS Button ("Nghe")** | Bulletin header, Notification rows, Disease result | On press: calls `/api/tts`, shows spinner, then plays audio. While playing: icon is "stop". On stop/end: returns to idle. Hidden (not disabled) if Piper unavailable. |
| **BulletinCard** | `/manager/bulletin` | Server-rendered. AI text in `body` typography. Source citations in `mono` + `ink-tertiary`. "Nghe" TTS button in card header. One card per commodity group. |
| **ChatWidget** | Chatbot pages (Manager + Officer) | Client component (`use client`). Message list + text input at bottom. Streaming response support (word-by-word). AI bubble: citation footer always rendered. 7-day message history in DB. |
| **FarmZoneMap** | Officer farm-zone, Manager farm-zone read-only | Dynamic import `ssr: false`. Polygon layer for parcels. Click popup: parcel name, status badge, household, quick-link to journal. Officer adds Leaflet.draw toolbar. Manager version: no draw toolbar. |
| **ParcelDrawer** | Officer farm-zone | Right-side drawer (desktop) / bottom sheet (mobile). Opens on polygon click. Shows: parcel detail, journal history, withdrawal status, [Approve Harvest] when eligible. |
| **JournalEntryForm** | Officer journal, Farmer journal | Multi-field form. Activity type dropdown drives conditional fields (product name + dosage + withdrawal shown only for "Spraying"). Weather auto-fetched on date change (Open-Meteo via `/api/weather`). |
| **BatchApprovePanel** | Officer pending journals | Table view with checkboxes. Filter by household. Sticky "Approve Selected (N)" button at bottom. Confirmation sheet before submit. |
| **LotWorkflowStepper** | Officer lots | 6-step wizard. Non-clickable step indicators. Step 4: parcel multi-select (only Harvest-Approved). Step 5: weight + spec required before Export QR enabled. Step 6: QR code display + download. |
| **WithdrawalStatusBlock** | Pre-harvest inspection (officer lots / parcel drawer) | Left-border card. PASSED: green border, "Phê duyệt thu hoạch" button visible. NOT YET: amber border, button hidden, remaining days shown. No-pesticide path: block shows "Không sử dụng thuốc — Tự động PASSED". |
| **DiagnosisUploader** | Farmer diagnosis | Image capture (camera or gallery). Parcel select dropdown (own parcels only). Confidence threshold display. Low-confidence (< 60%): warning banner — does not block submission. "Gửi Cán bộ KT" primary button. |
| **QRScanPage** | `/lot/[lotCode]` | Server Component, no auth. Four content blocks: Product & Lot, Origin, Journal & Safety, Certifications. Each block is a collapsible card (default expanded). Mobile-optimized typography. |
| **PartnerMapCRUD** | Manager partner-map | Leaflet + add/edit modal form. Nominatim address search autocomplete in form. Marker popup: name, type, contact, [Edit] [Delete]. Delete: confirmation modal with lot code displayed. |

---

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| **Loading — initial page** | All data pages | Skeleton cards matching the layout shape. Never a spinner-only screen. |
| **Loading — AI response** | Chatbot, Bulletin | Pulsing skeleton rows in the AI bubble. Word-by-word streaming fills in from left. |
| **Empty — no parcels** | Farm Zone Map | Map rendered (OpenStreetMap base visible). Centered overlay card: "Chưa có thửa đất. Hãy vẽ thửa đất đầu tiên." + [Bắt đầu vẽ] button. |
| **Empty — no journal entries** | Journal list | Illustration placeholder (leaf/notebook icon). "Chưa có nhật ký nào. Tạo nhật ký đầu tiên." + [Tạo nhật ký] button. |
| **Empty — no notifications** | Notification panel | "Chưa có thông báo nào." — no button. |
| **Empty — no lots** | Lots list | Card with QR icon. "Chưa có lô hàng. Tạo lô hàng đầu tiên sau khi phê duyệt thu hoạch." |
| **Error — API failure** | Bulletin page | "Không thể kết nối máy chủ AI. Hiển thị dữ liệu thô." + raw market data table. |
| **Error — Ollama unavailable** | Chatbot | Input disabled. Banner: "Máy chủ AI đang tạm dừng. Vui lòng thử lại sau." |
| **Error — form validation** | All forms | Inline error below field. Red border on field. No full-page error. |
| **Error — delete confirmation failed** | Partner map, Lots | Toast notification (bottom of screen): "Xóa thất bại. Vui lòng thử lại." |
| **Piper TTS unavailable** | Anywhere TTS button appears | Button hidden entirely — no error shown, no disabled state. |
| **Low confidence diagnosis** | Farmer diagnosis result | Warning banner above result: "Ảnh có thể chưa đủ rõ. Cân nhắc chụp lại." Does NOT block submission. |
| **Lot locked (QR Exported)** | Lot detail | All fields read-only. "Lô hàng đã xuất QR — không thể chỉnh sửa." banner at top. |
| **Offline (PWA)** | Farmer diagnosis | Camera + parcel select work offline. GPS captured at photo moment. "Đang chờ kết nối để tải lên." banner. Auto-submits when online. |
| **Pending journal** | Farmer journal list | Entry row shows amber "Chờ duyệt" badge. [Rút lại] button on row. Withdraw → status reverts to draft. |

---

## Interaction Primitives

**Tap/Click**
- Primary action: single tap
- Destructive actions (Delete partner, Reject journal entry): always require a confirmation modal, never trigger on single tap
- "Export QR" (irreversible): double confirmation — step preview + explicit button click

**Leaflet Map Interactions (Officer Farm Zone)**
- Draw mode: Leaflet.draw polygon tool activated by [Vẽ thửa mới] button in sidebar panel. ESC cancels draw.
- Polygon click: Opens `ParcelDrawer` (right-side on desktop, bottom sheet on mobile).
- Map click (no polygon): closes any open drawer.
- Zoom: mousewheel + pinch-to-zoom. Pan: drag.
- Address search: input triggers Nominatim autocomplete after 300ms debounce. Select result → map pans + centers.

**Form Patterns**
- `JournalEntryForm`: Activity type select → conditional fields animate in (slide down, 150ms). No full form re-render.
- Weather auto-fetch: fires on date field blur. Skeleton shows during fetch. Pre-filled if successful; field becomes editable if fetch fails.
- Zod validation: client-side real-time on blur; server-side validation on submit. Error messages: specific, not generic.
- Draft save: Lot creation → [Lưu nháp] button always visible in step 5. Draft persists on navigation away.

**Streaming AI Response**
- Chatbot and Bulletin: words stream in from API using ReadableStream. User can send next message only after full response received.
- Stop button visible during streaming — clicking stops the stream and shows partial response.

**Notification Bell**
- SSE connection from `/api/notifications/stream` maintains real-time count update.
- On click: dropdown panel opens, SSE mark-read signal sent → count resets.
- Panel closes on outside click or Escape.

**TTS Audio**
- On click: button transitions to "playing" state (stop icon). Audio plays via browser `<audio>` element from `/api/tts` response.
- On complete/stop: returns to idle state.
- Concurrent TTS: starting new audio stops any currently playing.

**Batch Approval**
- Select all checkbox selects visible rows only (filtered set).
- Sticky bottom bar shows "Phê duyệt (N mục đã chọn)".
- On confirm: progress indicator on each row. Failed rows remain checked with error state.

**PWA Offline (Disease Diagnosis)**
- If online: normal upload flow.
- If offline: [Chụp ảnh] and [Chọn thửa đất] remain enabled. Photo + GPS cached locally. Banner: "Đang chờ kết nối."
- On reconnect: auto-submit fires. Success banner: "Đã tải lên thành công."

---

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md`.

**Keyboard navigation**
- All interactive elements reachable via Tab in DOM order.
- Modals and drawers trap focus inside while open; return focus to trigger on close.
- Farm Zone Map: Leaflet does not support full keyboard drawing — this is a known limitation. A text-input fallback for parcel name + area is provided alongside the map draw.

**ARIA**
- `NotificationBell`: `aria-label="Thông báo — N chưa đọc"` (updates live). `aria-live="polite"` on count badge.
- `StatusBadge`: `role="status"` + `aria-label="Trạng thái: [value]"`.
- `TTS Button`: `aria-label="Nghe tóm tắt"` / `aria-label="Dừng phát"` based on state.
- `ChatWidget`: AI message bubbles include `aria-live="polite"` region. Source citation: `aria-label="Nguồn dữ liệu: [source]"`.
- `WithdrawalStatusBlock`: `role="region"` + `aria-label="Kiểm tra thời gian cách ly"`.
- Modals: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing to modal title.
- Loading skeletons: `aria-busy="true"` on parent container, `aria-label="Đang tải..."`.

**Tap targets**
- Minimum 44×44px for all interactive elements on mobile (farmer role especially).
- Bottom nav items: 64px height.
- Map popup buttons: 44px min height.

**Reduce Motion**
- Animations (sidebar slide, drawer open, streaming text) respect `prefers-reduced-motion: reduce`.
- Skeleton pulse animation: disabled under reduce-motion; static gray block shown instead.

**Farmer Role Specifics**
- `body-large` (17px) applied via `[data-role="farmer"]` on layout root — no separate components.
- TTS available on Today dashboard, notification panel, and disease result — core farmer accessibility touchpoints.
- Forms for farmers: fewer fields per screen, one primary action per screen, no dense tables.

---

## Key Flows

### Flow 1 — Quản lý HTX dùng bản tin thị trường (Tuấn, Trưởng HTX, 7:30 sáng trước cuộc họp)

1. Tuấn mở web trên điện thoại.
2. Trang Today load — thấy tóm tắt bản tin: "Giá lúa ST25 xuất khẩu ~20,400 đ/kg. Thương lái vùng Mekong đang chào 12,000 đ/kg."
3. Tuấn bấm [Nghe] — Piper TTS đọc bản tin 30 giây. Tuấn nghe trong lúc pha cà phê.
4. Tuấn mở tab Chatbot. Gõ: "Thương lái hỏi mua 12k/kg lúa ST25. Họ có đang lợi dụng mình không?"
5. **Climax:** AI trả lời: "Giá xuất khẩu FOB hiện tại ~20,400 đ/kg (USDA, 03/08). Giá chào 12,000 đ/kg thấp hơn 41%. Thuế EVFTA 0% (WTO). Không có căn cứ kỹ thuật nào cho mức chiết khấu này." Tuấn có đủ dữ liệu để đàm phán.

Failure path: Ollama unavailable → AI bubble shows: "Máy chủ AI tạm dừng. Đang hiển thị dữ liệu thô." → Raw market data table visible.

---

### Flow 2 — Cán bộ KT vẽ vùng trồng và phê duyệt thu hoạch (Linh, Cán bộ KT, trên laptop)

1. Linh vào `/officer/farm-zone`. Leaflet map hiển thị với base layer OSM.
2. Linh click [Thêm hộ nông dân] → form nhỏ: họ tên, số điện thoại → [Lưu].
3. Linh click [Vẽ thửa mới] → Leaflet.draw tool kích hoạt. Linh vẽ polygon trên bản đồ.
4. Polygon vẽ xong → drawer tự mở: gán hộ nông dân, chọn loại cây trồng, nhập năng suất ước tính.
5. [Lưu thửa đất] → polygon hiện màu xanh (Sowing) trên bản đồ.
6. Sau nhiều tuần nhật ký → Linh click thửa A3 → drawer mở → xem withdrawal status: "15/14 ngày — PASSED".
7. **Climax:** [Phê duyệt thu hoạch] → status → Harvest-Approved (cam). Notification tự gửi đến Trưởng HTX.

Failure path: Nominatim unavailable → address search shows error; polygon draw still functional (coordinates captured from draw).

---

### Flow 3 — Nông dân báo cáo bệnh cây (Minh, Nông dân trẻ, ngoài đồng)

1. Minh thấy lá lúa có đốm nâu. Mở web trên điện thoại.
2. Trang Today → [Chẩn đoán bệnh] quick-access button.
3. Trang Diagnosis: [Chụp ảnh] → camera mở, Minh chụp lá bệnh.
4. Dropdown: "Chọn thửa đất" → Minh chọn Thửa A3.
5. Upload → FastAPI inference → "Đạo ôn lá — Độ tin cậy 95%". Banner: "Cần xác nhận từ Cán bộ KT."
6. **Climax:** [Gửi Cán bộ KT] → Cán bộ KT nhận notification "Nông dân Nguyễn Văn Minh nghi ngờ Đạo ôn lá tại thửa A3 [Xem ảnh]". Trưởng HTX nhận web bell.

Offline path: Minh ở vùng mất sóng → Ảnh + thửa được cache offline. Banner: "Đang chờ kết nối." → Khi có sóng lại: auto-upload → notification gửi đến cán bộ.

Low confidence path: Confidence < 60% → Warning banner hiện nhưng không chặn gửi. Minh vẫn có thể [Gửi Cán bộ KT].

---

### Flow 4 — Cán bộ KT tạo lô QR truy xuất nguồn gốc (Linh, sau thu hoạch)

1. Linh vào `/officer/lots` → [Tạo lô hàng mới].
2. LotWorkflowStepper Step 1: Farm Zone đã setup (check).
3. Step 2: Nhật ký đã ghi (xem preview).
4. Step 3: Withdrawal status: PASSED → [Phê duyệt thu hoạch] (đã làm).
5. Step 4: Chọn thửa "Harvest-Approved". Lot code auto-fill: `MD2-ST25-20260720-001`.
6. Step 5: Preview đầy đủ — chỉ nhập Trọng lượng (500kg) + Quy cách đóng gói (10kg/bao, 50 bao).
7. **Climax:** Step 6: [Xuất QR] → QR code hiển thị + download. Lot status → QR Exported. Trưởng HTX nhận notification "Lô MD2-ST25-20260720-001 đã xuất QR."

Draft path: Linh click [Lưu nháp] ở step 5 → quay lại sau → lot resume từ step 5.

---

### Flow 5 — Nông dân ghi nhật ký canh tác (Minh, buổi sáng sau khi phun thuốc)

1. Minh vào `/farmer/journal` → [Tạo nhật ký].
2. Chọn thửa (chỉ thấy thửa của mình). Chọn ngày. Chọn hoạt động: "Phun thuốc".
3. Conditional fields xuất hiện: tên thuốc, liều lượng, thời gian cách ly.
4. Minh điền: "Regent 800WG", "50ml/16L", "14 ngày". Weather auto-fetch: "Nắng, 32°C, ẩm 75%".
5. [Gửi để duyệt] → status "Chờ duyệt". Cán bộ KT nhận notification.
6. Minh thấy entry trong list với badge vàng "Chờ duyệt" + nút [Rút lại].
7. **Climax (after Officer approves):** Badge chuyển sang xanh "Đã duyệt". Entry read-only. Withdrawal countdown bắt đầu.

---

## Responsive & Platform

**Manager on mobile (primary):**
- Bottom navigation: 5 items (Today / Bản tin / Chatbot / Bản đồ / Thêm).
- Partner Map: full-screen Leaflet on mobile; add partner via floating [+] button → bottom sheet form.
- Bulletin: card stack, single column. TTS button in card header, full width.
- Chatbot: input pinned to bottom of screen, message list scrolls above.

**Manager on desktop (secondary):**
- Sidebar navigation, two-column dashboard (bulletin summary + lot count + quick links).
- Partner Map: sidebar panel for add/edit alongside full-screen map.

**Officer on desktop (primary):**
- Sidebar + large map canvas (Farm Zone: map takes 70% of screen width; parcel info panel on right 30%).
- Batch approve: full table with checkboxes; multi-select works with Shift+click.
- Journal form: two-column on `lg+` (fields on left, weather + notes on right).

**Officer on mobile (secondary):**
- Farm Zone: map full-screen; "Add parcel" opens bottom sheet. Drawing on mobile is functional but non-ideal — acknowledged UX limitation.
- Lot workflow: linear single-column stepper.

**Farmer on mobile (only):**
- Bottom nav: 3 items (Today / Nhật ký / Chẩn đoán).
- Diagnosis: full-screen camera view on capture.
- All tap targets ≥ 44px. Single action per screen.

**Public QR Scan page:**
- Any device. Max-width 640px. Four blocks stacked vertically. Collapsible on mobile. Print-friendly CSS class.

---

## Inspiration & Anti-patterns

**Lifted from agricultural management apps (e.g., Granular, Trimble Ag):** The farm zone map as the operational hub — parcel as first-class entity, status visible at a glance. Officer centers workflow on the map.

**Lifted from Linear (project management):** The Today dashboard as a prioritized action queue — "what needs my attention right now?" Not a vanity metrics page.

**Lifted from Vietnamese government portals (e.g., cổng TTQG):** The bulletin format — headline + supporting data points in a broadcast-news metaphor, not an analytics dashboard. HTX managers are comfortable with this reading pattern.

**Rejected — Real-time WebSocket for MVP:** SSE (Server-Sent Events) is sufficient for notification count updates. WebSocket overhead not justified at this scale. Post-30/8 can revisit.

**Rejected — In-app messaging between actors:** System is not a communication platform. Announcements flow one-way (Manager → all; Officer → farmers). Direct replies happen via phone/Zalo outside the system.

**Rejected — Gamification of journal compliance:** No streaks, no points for daily journal entry. The 14-day progress bar is a neutral operational indicator, not a reward mechanism. Adding gamification to a compliance workflow risks trivializing the agricultural safety implications.

**Rejected — AI confidence percentage as a traffic light:** Disease diagnosis confidence shown as plain percentage + text warning at < 60%. No green/amber/red color-coding of the confidence — that would imply the AI's confidence score is clinically reliable, which it is not.
