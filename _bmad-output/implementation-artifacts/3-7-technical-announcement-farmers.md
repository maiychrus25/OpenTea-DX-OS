# Story 3.7: Technical Announcement (Farmers)

Status: ready-for-dev

> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.


## Story

As a Technical Officer,
I want to send specific technical announcements to farmers within a designated Farm Zone,
so that I can coordinate regional activities (e.g., "Mở nước tưới đồng loạt", "Phun thuốc phòng trừ rầy nâu").

## Dependencies
- **Depends on:** 3.2
- **Blocks:** 5.6

## Acceptance Criteria

1. **Given** I am logged in as an Officer **When** I navigate to `/officer/announcements/new` **Then** I see a form to create a new announcement.
2. **Given** the form **When** I select a Target Farm Zone and fill in the title/content **Then** I can submit it.
3. **Given** a submitted announcement **When** the backend processes it **Then** it must identify ALL farmers (`User` where role=FARMER) who own parcels inside that specific Farm Zone.
4. **Given** the list of target farmers **When** the transaction executes **Then** it creates a `Notification` record for each of those farmers.
5. **Given** a farmer logs in **When** they check the "Bell" icon (Story 5.1/Header) **Then** they see this announcement.

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Define Notification Schema**
  - File: `src/domain/schemas/notificationSchema.ts`
  - Implementation: `z.object({ user_id: string, title: string, content: string, type: string, read: boolean })`.
- [ ] **T1.2: Define Repository Port**
  - File: `src/domain/ports/INotificationRepository.ts`
  - Define `createMany(notifications: Omit<Notification, 'id'>[])`.
  - Define `findByUser(userId: string)`.

### 2. Infrastructure Layer (`src/infrastructure/`)
- [ ] **T2.1: Implement Repository**
  - File: `src/infrastructure/db/repositories/PrismaNotificationRepository.ts`
  - Use `prisma.notification.createMany`.

### 3. Application Layer (`src/application/`)
- [ ] **T3.1: Create Use Case**
  - File: `src/application/useCases/announcement/CreateTechnicalAnnouncementUseCase.ts`
  - Logic:
    1. Validate input `{ farm_zone_id, title, content }`.
    2. Query DB: Find all `Household`s that have at least one `Parcel` in the `farm_zone_id`.
    3. Map to unique `user_id`s from those households (filter out nulls if a household isn't linked to an app user).
    4. Construct an array of Notification objects.
    5. Call `INotificationRepository.createMany(array)`.

### 4. Presentation / API Layer (`src/app/api/`)
- [ ] **T4.1: API Route**
  - File: `src/app/api/announcements/route.ts` (POST)
  - Extract payload, verify `OFFICER` role, execute Use Case.

### 5. Frontend UI Layer (`src/app/(officer)/`)
- [ ] **T5.1: Announcement Form**
  - File: `src/app/(officer)/announcements/new/page.tsx`
  - Use `react-hook-form`. Fetch available Farm Zones for the dropdown.

## Dev Notes
- **Performance:** For a large HTX, a zone might have hundreds of farmers. `createMany` is essential here instead of looping and calling `create` one by one, to avoid DB connection exhaustion and slow response times.
