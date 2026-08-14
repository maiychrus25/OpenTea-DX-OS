# Story 2.7: Web Bell Notification System

Status: partial  ⚠️ CONFLICT RESOLVED 2026-08-14

> **IMPORTANT — Phân tách tasks:**
> - **T1 + T2 (BE):** Vẫn cần làm — Domain ports, Repository, Use Cases, API routes
> - **T3 + T4 (FE):** ❌ SUPERSEDED bởi story `7-11-notification-bell`
>   - Component location đổi: `components/features/notification/` → `components/ui/NotificationBell/`
>   - SWR polling vẫn được dùng (kế thừa trong 7-11)
>   - Mark-as-read (T4) sẽ implement trong 7-11
> - Dev làm 2-7 chỉ làm **T1 + T2**, sau đó 7-11 làm FE component


## Story

As an authenticated user (any role),
I want to see a bell icon in the top navigation bar that shows my unread notifications,
so that I am alerted to important events (e.g., new bulletins, journal approvals) without checking my email.

## Dependencies
- **Depends on:** 2.6
- **Blocks:** 2.8

## Acceptance Criteria

1. **Given** the `AppShell` component **When** rendered **Then** a bell icon is visible in the top right corner.
2. **Given** unread notifications for my `user_id` in the database **When** I view the bell icon **Then** it shows a red badge with the unread count.
3. **Given** I click the bell icon **When** it opens **Then** a dropdown/popover appears listing my notifications, sorted by `created_at` descending, with unread items styled distinctly (e.g., bold).
4. **Given** the notification dropdown **When** I click "Đánh dấu đã đọc" (Mark all as read) **Then** a request is sent to `PUT /api/notifications/read`, the red badge disappears, and the items are styled as read.
5. **Given** a specific notification **When** I click on it **Then** it is marked as read individually and I am redirected to the `link_url` (if present).
6. **Given** the architecture **When** notifications are fetched **Then** it uses an internal API polling mechanism (e.g., SWR every 60s) or SSE (Server-Sent Events) to keep the count updated without a full page reload.

## Tasks / Subtasks

- [ ] **T1: Backend Domain & Use Cases** (AC: 4, 6)
  - [ ] Create `src/domain/repositories/INotificationRepository.ts`. Methods: `getUserNotifications(userId, limit)`, `markAsRead(userId, notificationId?)`.
  - [ ] Implement `PrismaNotificationRepository`.
  - [ ] Create Use Cases: `GetUserNotificationsUseCase`, `MarkNotificationsReadUseCase`.

- [ ] **T2: Notification API Routes** (AC: 4, 6)
  - [ ] Create `src/app/api/notifications/route.ts` (GET). Fetches top 20 notifications + unread count.
  - [ ] Create `src/app/api/notifications/read/route.ts` (PUT). Accepts optional `notificationId` to mark one or all as read.

- [ ] **T3: Notification Bell Component** (AC: 1, 2, 3)
  - [ ] Create `src/components/features/notification/NotificationBell.tsx` (Client Component).
  - [ ] Use `lucide-react` for the Bell icon.
  - [ ] Implement a Popover/Dropdown UI to show the list.
  - [ ] Integrate SWR (install `swr` if not present) to fetch from `/api/notifications` and auto-revalidate every 60 seconds (`refreshInterval: 60000`).

- [ ] **T4: Mark as Read Logic** (AC: 4, 5)
  - [ ] Implement click handler for "Mark all as read" that calls `PUT /api/notifications/read` and triggers SWR mutation.
  - [ ] Implement click handler for individual items: mark read -> `router.push(link_url)`.

- [ ] **T5: Validate & Commit**
  - [ ] Ensure `AppShell` includes `<NotificationBell />`.
  - [ ] Ensure `npx tsc --noEmit` passes.
  - [ ] Commit: `feat(notification): implement web bell notification system with polling`

## Dev Notes

### Architecture Constraints

- **Polling vs WebSockets:** For the MVP, stick to SWR HTTP polling (every 60s) to keep infrastructure simple. Do NOT introduce WebSockets or Redis pub/sub at this stage. Server-Sent Events (SSE) could be an alternative if polling is too heavy, but SWR is fine for now.
- **Client Component:** The `<NotificationBell />` must be a Client Component because it relies on client-side state (popover open/close) and periodic fetching (`useSWR`). Pass the initial session `userId` to it if needed, or rely on the API route pulling `userId` from the session cookie.

### Data Model Reference

The `Notification` table (Prisma model: `Notification`) có fields:
- `id`, `recipient_id` (keycloak user ID — NOT `user_id`), `type` (NotificationType enum), `title`, `body` (NOT `content`), `is_read`, `deep_link_url`, `created_at`
- Query bằng: `prisma.notification.findMany({ where: { recipient_id: session.user.keycloakId }, orderBy: { created_at: 'desc' } })`
- Mark read: `prisma.notification.updateMany({ where: { recipient_id: ... }, data: { is_read: true } })`

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/src/domain/repositories/INotificationRepository.ts`
- `apps/web/src/infrastructure/db/repositories/PrismaNotificationRepository.ts`
- `apps/web/src/application/useCases/GetUserNotificationsUseCase.ts`
- `apps/web/src/application/useCases/MarkNotificationsReadUseCase.ts`
- `apps/web/src/app/api/notifications/route.ts`
- `apps/web/src/app/api/notifications/read/route.ts`
- `apps/web/src/components/features/notification/NotificationBell.tsx`
- `apps/web/src/components/features/notification/NotificationBell.module.css`

**Files to UPDATE:**
- `apps/web/src/components/layout/AppShell/AppShell.tsx` (Add NotificationBell)
- `apps/web/package.json` (Add `swr`)
