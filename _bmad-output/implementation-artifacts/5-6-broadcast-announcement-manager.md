# Story 5.6: Broadcast Announcement (Manager)

Status: ready-for-dev

> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.


## Story

As a Manager,
I want to send broadcast announcements (thông báo chung) to all members of the HTX,
so that I can share cooperative news globally.

## Dependencies
- **Depends on:** 3.7 (Uses same Notification schema).

## Acceptance Criteria

1. **Given** I am a Manager **When** I submit the broadcast form **Then** a `Notification` is created for every active user in the HTX.

## Hexagonal Architecture Design & Tasks

### 1. Application Layer (`src/application/`)
- [ ] **T1.1: Use Case**
  - File: `src/application/useCases/announcement/CreateBroadcastAnnouncementUseCase.ts`
  - Logic: Query `Prisma.user.findMany()`. Map to array of `Notification`. Call `INotificationRepository.createMany()`.

### 2. Frontend UI Layer (`src/app/(manager)/`)
- [ ] **T2.1: Broadcast Form**
  - File: `src/app/(manager)/announcements/new/page.tsx`
