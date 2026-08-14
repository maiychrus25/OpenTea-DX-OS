# Story 3.1: Household Management (Officer)

Status: ready-for-dev

> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.


## Story

As a Technical Officer,
I want to manage (CRUD) the list of farming households (nông hộ) in the cooperative,
so that I can accurately link land parcels and journals to the correct farmers.

## Dependencies
- **Depends on:** 2.8
- **Blocks:** 3.2

## Acceptance Criteria

1. **Given** I am logged in as an Officer **When** I navigate to `/officer/households` **Then** I see a paginated table of all households in the HTX (Household Name, Phone Number, Linked User Account).
2. **Given** the households list **When** I click "Thêm Nông Hộ" **Then** a modal opens allowing me to input `name`, `phone`, and optionally select a `user_id` (linking to a Keycloak `FARMER` account).
3. **Given** the modal form **When** I submit valid data (validated via Zod) **Then** a `POST` request to `/api/households` is made, the database updates, and the UI reflects the new row immediately via React state/SWR mutation.
4. **Given** a row in the table **When** I click "Sửa" (Edit) **Then** I can update the details via `PUT /api/households/[id]`.
5. **Given** a row in the table **When** I click "Xóa" (Delete) **Then** the household is deleted. If the household has active parcels, the system MUST reject the deletion with a `400 Bad Request` and a descriptive error message.

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Define Schema**
  - File: `src/domain/schemas/householdSchema.ts`
  - Implementation: Use `zod`.
    - `name`: string, min 2, max 100.
    - `phone`: string, optional, regex match for Vietnamese phone numbers `/(84|0[3|5|7|8|9])+([0-9]{8})\b/`.
    - `user_id`: string, optional (UUID format).
- [ ] **T1.2: Define Entity Types**
  - File: `src/domain/entities/Household.ts`
  - Implementation: Export `type Household = z.infer<typeof householdSchema> & { id: string, created_at: Date, updated_at: Date }`.
- [ ] **T1.3: Define Repository Port**
  - File: `src/domain/ports/IHouseholdRepository.ts`
  - Implementation: Interface with methods: `findAll(page: number, limit: number): Promise<{data: Household[], total: number}>`, `findById(id: string)`, `create(data: Omit<Household, 'id'...>)`, `update(id: string, data: Partial<Household>)`, `delete(id: string)`.

### 2. Infrastructure Layer (`src/infrastructure/`)
- [ ] **T2.1: Implement Prisma Repository**
  - File: `src/infrastructure/db/repositories/PrismaHouseholdRepository.ts`
  - Implementation: Implement `IHouseholdRepository` using `prisma.household`.
  - **Edge Case Handle:** In the `delete` method, wrap the `prisma.household.delete` in a `try/catch`. If Prisma throws `PrismaClientKnownRequestError` with code `P2003` (Foreign key constraint failed), throw a custom Domain Error `HouseholdHasDependenciesError`.

### 3. Application Layer (`src/application/`)
- [ ] **T3.1: Create Use Cases**
  - File: `src/application/useCases/household/ManageHouseholdUseCase.ts`
  - Implementation: Create a class with methods `createHousehold`, `updateHousehold`, `deleteHousehold`, `getHouseholds`.
  - Dependencies: Inject `IHouseholdRepository`.
  - Logic: Validate input using `householdSchema.parse()` before calling the repository.

### 4. Presentation / API Layer (`src/app/api/`)
- [ ] **T4.1: API Handlers**
  - File: `src/app/api/households/route.ts` (GET, POST)
  - File: `src/app/api/households/[id]/route.ts` (PUT, DELETE)
  - Logic:
    - Check Auth: `const session = await getServerSession(authOptions)`. Ensure `session.user.role === 'OFFICER'`. Return `403 Forbidden` if not.
    - Instantiate Use Case with Prisma adapter.
    - Execute Use Case. Catch `HouseholdHasDependenciesError` and return `NextResponse.json({ error: "Không thể xóa nông hộ đang có thửa đất." }, { status: 400 })`.

### 5. Frontend UI Layer (`src/app/(officer)/`)
- [ ] **T5.1: Page and Component**
  - File: `src/app/(officer)/households/page.tsx` (Server Component).
  - File: `src/app/(officer)/households/_components/HouseholdTable.tsx` (Client Component).
  - File: `src/app/(officer)/households/_components/HouseholdFormModal.tsx` (Client Component).
  - Logic:
    - Use `react-hook-form` coupled with `@hookform/resolvers/zod` referencing `householdSchema`.
    - Use a generic Table component.
    - Implement optimistic UI updates or SWR revalidation upon successful CRUD operations.

## Dev Notes
- **Testing Focus:** Pay special attention to the foreign key violation catching logic in the Infrastructure layer.
- **Database Schema Reminder:** The `Household` model has a one-to-many relationship with `Parcel`. `prisma.household.delete` will inherently fail if parcels exist unless cascading deletes are configured (which they shouldn't be for this project to maintain data integrity).
