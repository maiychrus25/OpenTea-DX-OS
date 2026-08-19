
# Story 8.9: Notifications Full Page + Farmer Combined (Ban tin & Thong bao)

**Status:** ready-for-dev
**Epic:** 8 -- FE Prototype Reconstruction (Phase 2)
**CORRECTION:** Farmer sidebar has COMBINED bulletin+notification page, not separate.

## Correct Sidebar Reference
Manager: No notifications menu item; access via bell -> /manager/notifications
Officer: No notifications menu item; access via bell -> /officer/notifications
Farmer: Ban tin & thong bao (sidebar) -> /farmer/bulletin-notifications [COMBINED PAGE]

## Farmer Sidebar (CORRECT from image)
1. Hom nay -> /farmer/dashboard
2. Ghi nhat ky -> /farmer/journal
3. Chan doan benh -> /farmer/disease
4. Thua cua toi -> /farmer/parcels
5. Ban tin & thong bao -> /farmer/bulletin-notifications [THIS]
6. Tai khoan cua toi -> /farmer/profile

## Story
As any user I want full notifications via bell dropdown. For Farmer, sidebar Ban tin & thong bao shows combined bulletin tab + notification tab.

## Acceptance Criteria

### AC-1: Full Notification Page /[role]/notifications (Manager + Officer via bell)
- eyebrow: THONG BAO, h1: Tat ca thong bao
- Top-right: Danh dau tat ca da doc button
- .notif-list.full (no max-height)
- 5 mock notifications (green unread, amber unread, green read, blue read, neutral read)

### AC-2: Notification Items (.notif-item)
- .notif-item.unread: bg #f4f9f5 (first 2 items)
- .notif-dot.tone-green/amber/blue/neutral

### AC-3: Mark All Read (client useState -- removes .unread from all)

### AC-4: Bell Dropdown Footer -> /[role]/notifications (updated in NotificationBell component)

### AC-5: Farmer Combined Page /farmer/bulletin-notifications
- 2 tabs: Ban tin | Thong bao
- Default: Ban tin tab (3-card grid, simplified from story 8-1)
- Thong bao tab: notification list same as AC-1

### AC-6: License Header + No Inline Styles

## Tasks
- [ ] Create (manager)/notifications/page.tsx [NEW]
- [ ] Create (officer)/notifications/page.tsx [NEW]
- [ ] Create (farmer)/bulletin-notifications/page.tsx [NEW] with 2 tabs
- [ ] Update NotificationBell footer link per role
- [ ] npm run build passes

## Scope Boundary

This is FE prototype work only. Mark-read state, filters, delete/preferences, TTS, SSE/polling transport, deep-link authorization and recipient fan-out belong to the notification BE/integration stories. The Farmer combined page is not a replacement for the shared bell contract.

## Dev Notes


### 🚀 KHAI THÁC TỪ PROTOTYPE (D:\FE)
- **JSX/Mock data**: Copy function `NotificationsView()` (L367-371) và mảng `notifications` (L43-48) trong `D:\FE\components\agri-app.tsx`.
- **CSS**: Copy các class `.notif-list.full`, `.notif-item`, `.notif-item.unread`, `.notif-dot.tone-*`, `.notif-panel` từ `D:\FE\app\globals.css`.
