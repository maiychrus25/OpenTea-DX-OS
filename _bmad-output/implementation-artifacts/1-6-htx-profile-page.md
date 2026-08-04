# Story 1.6: HTX Profile Page (Manager View)

Status: ready-for-dev

## Story

As an HTX Manager,
I want to view and edit the central HTX Profile,
so that I can keep our cooperative's information, contact details, and supported crop types up to date for public and internal use.

## Dependencies
- **Depends on:** 1.5
- **Blocks:** 1.7

## Acceptance Criteria

1. **Given** I am logged in as a MANAGER **When** I navigate to `/manager/profile` **Then** I see the HTX Profile page with the current data loaded from the database (Name, Address, Phone, Email, HTX Code, Crop Types, Season Label, Total Area).
2. **Given** the HTX Profile page **When** I view it initially **Then** it is in "Read-only" mode displaying the information in a clean, card-based layout.
3. **Given** the HTX Profile page **When** I click "Edit" **Then** the fields become editable form inputs (using `react-hook-form`).
4. **Given** I am editing the profile **When** I submit the form **Then** it validates the input (e.g., valid email, required fields) using `zod`.
5. **Given** a valid form submission **When** I click "Save" **Then** a request is sent to `PUT /api/profile`, the database is updated, the UI returns to read-only mode, and a success toast notification appears.
6. **Given** a failed form submission (e.g., network error or server validation) **When** the error occurs **Then** an error toast notification appears and the form remains in edit mode.
7. **Given** I am a FARMER or OFFICER **When** I attempt to navigate to `/manager/profile` or `PUT /api/profile` **Then** the middleware/API route rejects the request (403/Redirect).

## Tasks / Subtasks

- [ ] **T1: Define Zod Schemas** (AC: 4)
  - [ ] Create `src/domain/schemas/htxProfileSchema.ts`.
  - [ ] Define `htxProfileUpdateSchema` using Zod matching the editable fields of `HtxProfile`. Ensure strict validation (email format, string lengths).

- [ ] **T2: Backend Implementation (Update Use Case & API Route)** (AC: 5, 7)
  - [ ] Add `updateProfile(data: Partial<HtxProfile>): Promise<HtxProfile>` to `IHtxProfileRepository`.
  - [ ] Implement `updateProfile` in `PrismaHtxProfileRepository`.
  - [ ] Create `src/application/useCases/UpdateHtxProfileUseCase.ts`.
  - [ ] Update `src/app/api/profile/route.ts` to add a `PUT` handler.
  - [ ] Inside `PUT`: Authenticate request (`auth()`), authorize (must be MANAGER), validate request body with Zod, execute `UpdateHtxProfileUseCase`, return updated profile.

- [ ] **T3: Frontend Component (Client)** (AC: 2, 3, 4, 5, 6)
  - [ ] Create `src/app/(manager)/profile/_components/ProfileForm.tsx` (Client Component).
  - [ ] Setup `react-hook-form` with `@hookform/resolvers/zod` using `htxProfileUpdateSchema`.
  - [ ] Implement state toggle `isEditing` (boolean).
  - [ ] Use UI components from Story 1.2 (`Card`, `Button`, input fields).
  - [ ] Implement `onSubmit` handler that calls `fetch('/api/profile', { method: 'PUT', ... })`.
  - [ ] Integrate a Toast notification library (e.g., `sonner` or `react-hot-toast` — choose one and add to `package.json`) for success/error feedback.

- [ ] **T4: Frontend Page (Server)** (AC: 1, 7)
  - [ ] Create `src/app/(manager)/profile/page.tsx` (Server Component).
  - [ ] Fetch the initial profile data directly via the Use Case: `const profile = await new GetHtxProfileUseCase(new PrismaHtxProfileRepository(prisma)).execute()`.
  - [ ] Pass the initial data to `<ProfileForm initialData={profile} />`.

- [ ] **T5: Validate & Commit**
  - [ ] Ensure `npx tsc --noEmit` passes.
  - [ ] Commit: `feat(profile): implement htx profile view and update for managers`

## Dev Notes

### Architecture Constraints

- **Server-Side Data Fetching (T4):** In Next.js App Router, Server Components should fetch data directly (using Use Cases or Prisma directly if simple enough, but stick to Use Cases for consistency), rather than calling their own API routes (`fetch('/api/profile')`).
- **Client-Side Mutations (T3):** Form submissions from Client Components call API routes (`PUT /api/profile`).
- **Validation (T1, T2):** Zod schemas belong in the Domain (or a shared cross-cutting layer) so both the frontend (`react-hook-form` resolver) and backend (API route body validation) can share the exact same validation rules.

### Toast Library Recommendation

Install `sonner` for toast notifications. It's lightweight, modern, and easy to style.
```bash
npm install sonner
```
Remember to add `<Toaster />` to the root layout or `AppShell` so toasts can render globally.

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/src/domain/schemas/htxProfileSchema.ts`
- `apps/web/src/application/useCases/UpdateHtxProfileUseCase.ts`
- `apps/web/src/app/(manager)/profile/page.tsx`
- `apps/web/src/app/(manager)/profile/_components/ProfileForm.tsx`

**Files to UPDATE:**
- `apps/web/src/domain/repositories/IHtxProfileRepository.ts`
- `apps/web/src/infrastructure/db/repositories/PrismaHtxProfileRepository.ts`
- `apps/web/src/app/api/profile/route.ts` (Add PUT)
- `apps/web/package.json` (Add `zod`, `react-hook-form`, `@hookform/resolvers`, `sonner`)
- `apps/web/src/components/layout/AppShell/AppShell.tsx` (or root layout, to add `<Toaster />`)
