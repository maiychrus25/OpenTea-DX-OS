<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Phase 1 S2 — Multi-role Accounts, Accountant and Platform Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One account can hold several roles in its cooperative and switch between them with one tap. Two new roles exist: `accountant` and `platform_admin`. The platform admin takes over cooperative creation, AI provider and budget settings, and the shared pesticide catalogue. Nobody is forced to set up TOTP or give an email to sign in.

**Architecture:**
- Keycloak realm roles stay the source of truth.
- The NextAuth session carries `roles` and the active `role`.
- `requireTenant()` syncs `htx_memberships` from the token.
- New areas `/accountant` (skeleton) and `/platform` (Prisma only).
- One track, worktree branch `p1/s2-roles`, tasks in order.

**Tech Stack:** Next.js 14, NextAuth 5 (check the exact version in `apps/web/package.json` for the session update API), Keycloak admin REST via `KeycloakAdminAdapter`, Prisma 5, Jest + RTL, Python pytest for the realm policy.

**Spec:** `docs/specs/2026-11-28-phase1-s2-multi-role-design.md`. Read all of it. §7 overrides the earlier sections where they disagree.

## Global Constraints

- **Code style:** English identifiers; Vietnamese copy exactly as the spec quotes it; routes with `withErrorHandler`, zod, envelope; no inline `style`; tokens; light and dark; 390 px.
- **Server-side checks:** every role check is server-side. `role` in the session means the active role; `roles` is the full list.
- **Role names:** never use the name `admin`. Human role names: `farmer`, `officer`, `accountant`, `manager`, `platform_admin`.
- **Migrations:** the migration file commits normally. Add the audit trigger for `htx_memberships` both to the `03-audit-triggers.sql` array and inside the migration (syntax as in `apps/web/prisma/migrations/20261127190000_app_builder/migration.sql`).
- **Shared S1 files:** another track (S1) edits `prisma/schema.prisma`, `app/officer/layout.tsx` and `app/manager/layout.tsx` at the same time. Keep your edits to those files minimal and self-contained (append your model; do not reorder). Do not touch journal, cycle, lot or pesticide code. The pesticide tables are created by S1: your `/platform/pesticides` page and its route read and write the Prisma models `PesticideProduct` (fields per S1 spec §4.1). Code against those names; until S1 merges, your tests mock Prisma.
- **Commits:** `git -c user.name=maiychrus25 -c user.email=ninhkhuongpl7@gmail.com commit`; English Conventional Commits; no Co-Authored-By; no AI mention; no push.
- **Secrets and Docker:** never open `.env*`; no Docker; do not run `./dxos`.
- **Checks before reporting:** `cd apps/web && npx prisma generate && npm test -- --ci && npm run lint && npx tsc --noEmit && npx next build`; `python -m pytest -q platform/tests/test_realm_policy.py` with the venv `/private/tmp/claude-501/-Users-maiychrus-OpenTea-DX-OS/b292ad45-1d8d-4b4a-93e8-fa34276aacfc/scratchpad/venv-p0d`.

## Review Focus

1. **A session cookie from before the deploy** (has `role`, no `roles`): pages and APIs keep working as `roles = [role]`. Owner: Task 1, test `legacy session without roles keeps working`.
2. **Switching to a role the token does not hold**, by a crafted request: 403, and the session is unchanged. Owner: Task 2.
3. **A user switched to `farmer` calls a manager-only API:** 403 (the web checks the active role). Owner: Task 2, test `active role gates manager routes`.
4. **Token refresh after the active role was revoked in Keycloak:** falls back to the default role without an error. Owner: Task 1.
5. **Creating a cooperative where Keycloak user creation fails after the profile row was written:** the profile row is removed and nothing is half-created. Owner: Task 4.

---

### Task 1: Roles in token, session and middleware

**Files:**
- Create: `apps/web/src/lib/auth/roles.ts`:
  - `HumanRole`
  - `rolesFromRealmRoles(roles: unknown): HumanRole[]`
  - `defaultActiveRole(roles: HumanRole[]): HumanRole | undefined`, with priority manager > officer > accountant > farmer > platform_admin
  - `homeFor(role: HumanRole): string`, returning `/platform` for `platform_admin` and `/<role>/dashboard` otherwise
- Modify:
  - `apps/web/src/auth.ts` (`jwt` sets `roles` and the active `role` at sign-in; later calls keep a valid active role); `apps/web/src/lib/auth/token-refresh.ts` (spec §7.3; keep `roleFromRealmRoles` exported only if callers need it, otherwise replace its callers)
  - `apps/web/src/types/next-auth.d.ts`
  - `apps/web/src/middleware.ts` (5 areas; `/unauthorized?switch=<role>` when the user holds the role but it is not active)
  - `apps/web/src/lib/api/tenant.ts` (`Tenant.role` widened; `platform_admin` throws `ForbiddenError`)
  - `apps/web/src/app/unauthorized/page.tsx` (switch button when `?switch=` names a held role)
  - `apps/web/src/app/api/dev-login/route.ts` (adds `accountant` and `platform_admin`; sets `roles`)
- Tests:
  - `lib/auth/roles.test.ts`
  - `lib/auth/token-refresh-roles.test.ts` (with `legacy session without roles keeps working` and `refresh keeps a valid active role and falls back when revoked`)
  - `middleware/role-areas.test.ts`

- [ ] **Step 1:** Write the failing tests: priority order; unknown realm roles ignored; service roles (`agent`, `telegram`, …) never become human roles; middleware allows and denies each of the 5 areas; the `?switch=` redirect.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them plus the full suite. Expect PASS.
- [ ] **Step 5: Commit** `feat(auth): carry every role in the session and route by the active role`.

### Task 2: Membership sync, role switch API and switcher UI

**Files:**
- `apps/web/prisma/schema.prisma`: model `HtxMembership` (spec §4.1); the back-relation `memberships HtxMembership[]` on `HtxProfile`
- Create: `apps/web/prisma/migrations/20261128130000_htx_memberships/migration.sql` (table, unique, index, audit trigger)
- `platform/postgres/init/03-audit-triggers.sql` (add `htx_memberships`)
- Create: `infrastructure/db/auth/PrismaMembershipRepository.ts` with `sync(userId: string, htxProfileId: string, roles: HumanRole[]): Promise<void>` (upsert when missing or different; an in-process cache of synced `userId|htxProfileId|roles` keys; errors logged, never thrown)
- Call `sync` from `requireTenant()`
- Create: `app/api/session/role/route.ts` (POST `{ role }`)
- Create: `components/layout/RoleSwitcher/RoleSwitcher.tsx` (+ css), mounted in the `Sidebar` profile popup and the mobile account menu; shown only when `roles.length >= 2`
- Thread `roles` from the layouts to `AppShell`
- Tests:
  - `infrastructure/membership-sync.test.ts`
  - `app/api/session-role.test.ts` (403 for a role not held; 200 with `home`; `active role gates manager routes`)
  - `components/role-switcher.test.tsx` (hidden with one role; `aria-current`; disabled while pending; error toast)

- [ ] **Step 1:** Write the failing tests above.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. For the NextAuth session update, use the API of the installed version. Record which one in the commit body.
- [ ] **Step 4:** Run them plus the full suite. Expect PASS.
- [ ] **Step 5: Commit** `feat(auth): membership table, role switch endpoint and role switcher`.

### Task 3: Realm, invitations and member roles

**Files:**
- `docker/keycloak/realm-agrimarket.json`:
  - realm roles `accountant` and `platform_admin`;
  - users `accountant_tc` (role `accountant`, `htx_code` TC) and `platform_admin` (role `platform_admin`, no `htx_code`), with the same password style as the other demo users;
  - remove `CONFIGURE_TOTP` from every demo user;
  - `email` not required in the user profile.
- `platform/tests/test_realm_policy.py`: new rules per spec §4.6, updating `DEMO_USERS` and the TOTP test.
- `infrastructure/db/auth/keycloak-admin.adapter.ts`:
  - `registerUser` takes `roles: string[]` and never sets `CONFIGURE_TOTP`;
  - new `setRealmRoles(userId, add, remove)`.
- `app/api/members/invite/route.ts`, `application/auth/invite-member.use-case.ts`: `roles[]`, `accountant` allowed, membership row, household when `farmer`.
- Create: `app/api/members/[id]/roles/route.ts` (PUT, rules of spec §7.7).
- `app/api/members/route.ts`: grouped per person with `roles[]`, managers included.
- `app/manager/members/_components/*`: roles column, "Sửa vai" dialog, multi-role invite.
- Tests: `test_realm_policy.py`; `app/api/members-roles.test.ts` (other HTX gives 404; another manager gives 403; empty set for a non-manager gives 422; adding `farmer` creates or links a household; removing `farmer` keeps the household); `ui/members-roles.test.tsx`.

- [ ] **Step 1:** Write the failing tests above.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them plus the realm pytest. Expect PASS.
- [ ] **Step 5: Commit** `feat(members): optional TOTP and email, multi-role invitations and role editing`.

### Task 4: Accountant area and platform area

**Files:**
- Create `app/accountant/layout.tsx` and `app/accountant/dashboard/page.tsx` (spec §4.4, real empty state, no figures).
- Create `app/platform/layout.tsx` and `app/platform/page.tsx` (cooperative list).
- Create `app/api/platform/htx/route.ts` (POST create with compensation) and `app/api/platform/htx/[code]/agent-settings/route.ts` (GET, PUT).
- Create `app/platform/htx/[code]/ai/page.tsx` (reuses `AgentSettingsPanel` with an endpoint prop).
- Create `app/platform/pesticides/page.tsx` and `app/api/platform/pesticides/[id]/route.ts` (PUT `{ default_phi_days: 1..365, phi_needs_label_check: boolean, active: boolean }`; `platform_admin` only).
- Create `lib/api/platform.ts` with `requirePlatformAdmin(): Promise<{ userId: string }>`.
- Modify `app/api/agent/settings/route.ts` (PUT returns 403 with the spec message; `can_edit` false) and the manager and officer settings pages (read-only line).
- Tests:
  - `app/api/platform-htx.test.ts`: create OK; duplicate code gives 409; duplicate phone gives 409; Keycloak failure leaves no profile; non-admin gives 403.
  - `app/api/platform-agent-settings.test.ts`
  - `app/api/platform-pesticides.test.ts`
  - `app/api/agent-settings-locked.test.ts`
  - `app/accountant/dashboard.test.tsx`

- [ ] **Step 1:** Write the failing tests above.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. Add the `kcadm` commands for creating a platform admin and clearing a pending `CONFIGURE_TOTP` to `docs/dev-setup.md` (the only doc this track edits).
- [ ] **Step 4:** Run the full check list from Global Constraints. Expect PASS.
- [ ] **Step 5: Commit** `feat(platform): accountant area, platform admin area for cooperatives, AI settings and the pesticide catalogue`.

## Integration (main session)

- Merge after S1 BE (the pesticide model).
- Run all checks.
- Do two UI rounds: role switcher with a 3-role account, `/accountant/dashboard`, `/platform`, the AI page, the pesticide page, and the members roles dialog.
- Docs task: rules-and-limits §4.1 and §4.2, api-contract, database-schema, CHANGELOG, the spec status line and the timeline.
