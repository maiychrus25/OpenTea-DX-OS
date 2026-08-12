# GitHub Issues Creation Script for OpenTea-DX-OS
# Avoids UTF-8 encoding issues by using ASCII-only body text in CLI args
# and writing body to temp files with explicit UTF-8 encoding

$REPO = "maiychrus25/OpenTea-DX-OS"
$ASSIGNEES = "maiychrus25"
$env:GITHUB_TOKEN = ''

$issueCount = 0

function New-Issue {
    param(
        [string]$Title,
        [string]$Body,
        [string]$Labels
    )
    $tempFile = [System.IO.Path]::GetTempFileName() + ".md"
    [System.IO.File]::WriteAllText($tempFile, $Body, [System.Text.Encoding]::UTF8)
    $result = gh issue create `
        --repo $REPO `
        --title $Title `
        --body-file $tempFile `
        --label $Labels `
        --assignee $ASSIGNEES 2>&1
    Remove-Item $tempFile -Force
    Write-Host "Created: $Title -> $result"
    $script:issueCount++
    Start-Sleep -Milliseconds 500
}

Write-Host "=== Creating CRITICAL security issues ==="

# F5-1: Middleware security hole
New-Issue `
    -Title "[F5-1][CRITICAL] Middleware excludes all /api/ routes from auth check" `
    -Body @"
## Finding F5-1 — Security Hole in Middleware

**Severity:** CRITICAL (Security)
**Story:** 1.5 — Keycloak Auth & Role Routing
**File:** ``apps/web/src/middleware.ts`` (line 52-54)

### Problem
Middleware matcher ``/((?!api|_next/static|_next/image|favicon.ico).*)`` excludes **all** ``/api/`` routes from authentication.

Only ``/api/auth`` should be excluded. Currently ``/api/profile``, ``/api/market-data``, and all future API endpoints are **completely unprotected** at the middleware level.

### Impact
- Contradicts NFR-10: "Role-based authorization enforced server-side via middleware"
- Any future API route that forgets to add its own auth check is wide open
- Violates Security Rule: auth check MUST be server-side

### Fix
Change matcher to:
``````typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
``````

### Acceptance Criteria
- [ ] ``/api/profile`` returns 401 when called without session cookie
- [ ] ``/api/auth/*`` still works for NextAuth callbacks
- [ ] All existing authenticated API routes still work

**Related:** F5-2, Story 1.5b
"@ `
    -Labels "bug,security,epic-1"

# F5-2: Route group middleware bypass
New-Issue `
    -Title "[F5-2][CRITICAL] (manager)/profile/ bypasses middleware role check" `
    -Body @"
## Finding F5-2 — Role Check Bypass

**Severity:** CRITICAL (Security)
**Story:** 1.5 — Keycloak Auth & Role Routing
**File:** ``apps/web/src/middleware.ts`` (line 28-30)

### Problem
Middleware checks ``lowerPath.startsWith("/manager")`` but ``(manager)/profile/`` is a Next.js route group resolving to ``/profile`` (no ``/manager`` prefix).

The HTX Profile page is accessible to **any authenticated user** (officer, farmer), not just managers.

### Fix
Move profile from ``app/(manager)/profile/`` to ``app/manager/profile/``.
This makes the URL ``/manager/profile`` and middleware protection works correctly.

### Acceptance Criteria
- [ ] Officer cannot access ``/manager/profile`` (redirected to ``/unauthorized``)
- [ ] Farmer cannot access ``/manager/profile``
- [ ] Manager can still access ``/manager/profile``
- [ ] Route ``app/(manager)/`` directory deleted

**Related:** F5-1, Story 1.5b, Story 2.6a
"@ `
    -Labels "bug,security,epic-1"

# F1-1: Missing Ollama
New-Issue `
    -Title "[F1-1][CRITICAL] Ollama service missing from docker-compose.yml" `
    -Body @"
## Finding F1-1 — Missing Ollama Service

**Severity:** CRITICAL
**Story:** 1.1 — Monorepo & Docker Compose Stack
**File:** ``docker/docker-compose.yml``

### Problem
AC requires 8 services including ``ollama`` (port 11434). Only 7 services exist.
Ollama is completely absent from docker-compose.

### Impact
- Chatbot (Story 2.5) will fail
- Bulletin synthesis (Story 2.4) will fail
- All AI features requiring Ollama will fail at runtime

### Fix
Add to docker-compose.yml:
``````yaml
ollama:
  image: ollama/ollama
  volumes:
    - ollama_data:/root/.ollama
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
    interval: 30s
    timeout: 10s
    retries: 3
``````
Add ``ollama_data`` to volumes section.
Add ``OLLAMA_MODEL`` env var to web service.

### Acceptance Criteria
- [ ] ``docker compose up`` starts ollama service
- [ ] ``curl http://localhost:11434/api/tags`` returns 200
- [ ] ``OLLAMA_MODEL`` env var present in ``.env.example``
"@ `
    -Labels "bug,docker,epic-1"

# F1-2: Exposed ports security
New-Issue `
    -Title "[F1-2][CRITICAL] Internal service ports exposed externally in docker-compose" `
    -Body @"
## Finding F1-2 — Exposed Ports Security Violation

**Severity:** CRITICAL (Security)
**Story:** 1.1 — Monorepo & Docker Compose Stack
**File:** ``docker/docker-compose.yml``

### Problem
Security rule: "KHONG expose internal service ports ra ngoai Docker (chi web:3000, keycloak:8080, minio:9001)"

Currently exposed (should be internal only):
- PostgreSQL ``5432:5432`` -- DB exposed to host
- n8n ``5678:5678`` -- should be internal
- Piper ``5500:10200`` -- should be internal
- MinIO ``9000:9000`` -- API port internal, only console 9001 allowed
- disease-api ``8001:8000`` -- should be internal

### Fix
Remove port mappings for postgres, n8n, piper, minio:9000, disease-api.
Keep only: ``3000:3000`` (web), ``8080:8080`` (keycloak), ``9001:9001`` (minio console).

### Acceptance Criteria
- [ ] PostgreSQL only accessible within Docker network
- [ ] n8n only accessible from web service
- [ ] disease-api only accessible from web service
- [ ] Piper only accessible from web service
- [ ] MinIO console still accessible at localhost:9001

**Reference:** AGENTS.md Security Rules
"@ `
    -Labels "bug,security,docker,epic-1"

# F2-1: Login page inline styles
New-Issue `
    -Title "[F2-1][CRITICAL] Login page uses inline styles instead of CSS Modules" `
    -Body @"
## Finding F2-1 — CSS Architecture Violation

**Severity:** CRITICAL (Architecture)
**Story:** 1.2 — Design System & Shared Components
**File:** ``apps/web/src/app/(auth)/login/page.tsx``

### Problem
``LoginPage.module.css`` exists but is NOT imported.
The page uses inline ``style={{...}}`` on container div and button — violates AD-6.

### Fix
- Import ``LoginPage.module.css`` in ``login/page.tsx``
- Remove ALL ``style={{}}`` attributes
- Use CSS custom properties from ``globals.css`` (``--color-primary``, ``--spacing-*``, etc.)
- Use ``Card`` and ``Button`` components from ``@/components/ui``

### Acceptance Criteria
- [ ] No ``style={{`` in ``login/page.tsx``
- [ ] ``LoginPage.module.css`` imported and classes applied
- [ ] CSS uses tokens: ``--color-primary``, ``--spacing-*``, ``--rounded-md``
- [ ] Page uses ``Card`` and ``Button`` design system components

**Related:** Story 1.5a
"@ `
    -Labels "bug,css,epic-1"

# F2-2: Unauthorized page inline styles
New-Issue `
    -Title "[F2-2][CRITICAL] Unauthorized page built entirely with inline styles" `
    -Body @"
## Finding F2-2 — CSS Architecture Violation

**Severity:** CRITICAL (Architecture)
**Story:** 1.2 — Design System & Shared Components
**File:** ``apps/web/src/app/unauthorized/page.tsx``

### Problem
Entire unauthorized page is built with inline ``style={{...}}``.
No CSS module file exists for this page. Violates AD-6.

### Fix
- Create ``apps/web/src/app/unauthorized/Unauthorized.module.css``
- Remove ALL inline styles from ``unauthorized/page.tsx``
- Use design tokens from ``globals.css``
- Use ``Card`` and ``Button`` from ``@/components/ui``

### Acceptance Criteria
- [ ] No ``style={{`` in ``unauthorized/page.tsx``
- [ ] ``Unauthorized.module.css`` created with proper design tokens
- [ ] Page shows "403 -- Khong co quyen truy cap" heading
- [ ] Button links to role-appropriate dashboard

**Related:** Story 1.5d
"@ `
    -Labels "bug,css,epic-1"

# F4-1: Domain layer structure
New-Issue `
    -Title "[F4-1/F4-2/F4-3][CRITICAL] Hexagonal architecture directories incomplete" `
    -Body @"
## Findings F4-1, F4-2, F4-3 — Incomplete Architecture Scaffolding

**Severity:** CRITICAL
**Story:** 1.4 — Hexagonal Architecture Scaffold

### Problem

**Domain layer (F4-1):** Missing 6 of 8 required directories:
- Missing: ``domain/bulletin/``, ``domain/journal/``, ``domain/lot/``, ``domain/farm/``, ``domain/notification/``, ``domain/disease/``, ``domain/shared/value-objects/``, ``domain/shared/errors/``
- Present only: ``domain/profile/``, ``domain/errors/``, ``domain/models/`` (empty), ``domain/use-cases/`` (empty)

**Application layer (F4-2):** Flat ``application/useCases/`` instead of feature-based dirs:
- Missing: ``application/bulletin/``, ``application/journal/``, ``application/lot/``, ``application/farm/``, ``application/disease/``, ``application/notification/``

**Infrastructure layer (F4-3):** Missing all adapter directories:
- Missing: ``infrastructure/ai/``, ``infrastructure/tts/``, ``infrastructure/storage/``, ``infrastructure/qr/``, ``infrastructure/disease-api/``, ``infrastructure/notification-channels/``

### Fix
Create all missing directories with ``.gitkeep`` placeholders.
Migrate ``domain/errors/`` -> ``domain/shared/errors/``.

### Acceptance Criteria
- [ ] All 8 domain feature directories exist
- [ ] All 6 application feature directories exist
- [ ] All 6 infrastructure adapter directories exist
- [ ] ``lib/validations/`` directory created

**Related:** F4-4, F4-5, F4-6, Stories 2.0a, 2.3a, 3.5a, 4.6a
"@ `
    -Labels "bug,architecture,epic-1"

# FC-1: console.error in production code
New-Issue `
    -Title "[FC-1][CRITICAL] console.error in committed production code" `
    -Body @"
## Finding FC-1 — Committed console.error Violations

**Severity:** CRITICAL
**Rule:** "Khong de lai console.log trong committed code"

### Files Affected
1. ``apps/web/src/presentation/api/withErrorHandler.ts`` (line 62): ``console.error('Unhandled API Error:', err)``
2. ``apps/web/src/components/copy-url-button.tsx`` (line 14): ``console.error("Copy failed", error)``

### Fix
Replace ``console.error`` with proper error handling:
``````typescript
// Instead of:
console.error('Unhandled API Error:', err)

// Use structured error logging or re-throw:
// Option: use a logger utility (e.g., src/lib/logger.ts)
logger.error('API Error', { error: err, path: req.url })
``````

### Acceptance Criteria
- [ ] No ``console.error`` in ``withErrorHandler.ts``
- [ ] No ``console.error`` in ``copy-url-button.tsx``
- [ ] Errors handled via proper error boundaries or logger utility
- [ ] ``grep -r 'console\.(log|error|warn)' apps/web/src`` returns 0 results in committed files
"@ `
    -Labels "bug,epic-1"

Write-Host ""
Write-Host "=== Creating HIGH severity issues ==="

# F2-3: Tailwind classes
New-Issue `
    -Title "[F2-3][HIGH] Profile page uses Tailwind classes (violates No-Tailwind rule)" `
    -Body @"
## Finding F2-3 — Tailwind Usage Violation

**Severity:** HIGH
**Story:** 1.2 — Design System
**File:** ``apps/web/src/app/(manager)/profile/page.tsx``

### Problem
Uses Tailwind classes: ``p-6 max-w-4xl mx-auto w-full``, ``text-2xl font-bold text-gray-900``.
Project rule: "Khong Tailwind". These classes have no effect (Tailwind not installed).

### Fix
Replace with CSS Modules using design tokens from ``globals.css``.

### Acceptance Criteria
- [ ] No Tailwind class names in ``profile/page.tsx``
- [ ] CSS Module created with proper design tokens
- [ ] Page visually correct with CSS Modules styling
"@ `
    -Labels "bug,css,epic-1"

# F2-4: Wrong CSS custom properties
New-Issue `
    -Title "[F2-4][HIGH] ProfileForm.module.css uses non-existent CSS custom properties" `
    -Body @"
## Finding F2-4 — Broken CSS Token References

**Severity:** HIGH
**Story:** 1.2 — Design System
**File:** ``apps/web/src/app/(manager)/profile/_components/ProfileForm.module.css``

### Problem
File references CSS variables that do NOT exist in ``globals.css``:
- ``--border`` -> should be ``--color-border-default``
- ``--text-primary`` -> should be ``--color-ink-primary``
- ``--text-secondary`` -> should be ``--color-ink-secondary``
- ``--bg-primary`` -> should be ``--color-surface-card``
- ``--primary`` -> should be ``--color-primary``
- ``--primary-light`` -> should be ``--color-primary-subtle``
- ``--radius-md`` -> should be ``--rounded-md``
- ``--danger`` -> should be ``--color-danger``

All CSS variables resolve to empty/initial values causing broken styling.

### Acceptance Criteria
- [ ] All CSS custom properties in ``ProfileForm.module.css`` exist in ``globals.css``
- [ ] Profile form renders with correct colors and spacing
- [ ] grep for non-existent tokens returns 0 results
"@ `
    -Labels "bug,css,epic-1"

# F2-5: No role layouts
New-Issue `
    -Title "[F2-5][HIGH] Role-specific layouts (AppShell) not implemented" `
    -Body @"
## Finding F2-5 — Missing Layout Shells

**Severity:** HIGH
**Story:** 1.2 — Design System & Shared Components

### Problem
No role-specific layouts exist:
- ``app/(manager)/layout.tsx`` -- does not exist
- ``app/officer/layout.tsx`` -- does not exist
- ``app/farmer/layout.tsx`` -- does not exist
- ``AppShell`` component exists but is not used anywhere

No user sees sidebar, TopBar, or BottomNav. All role pages are bare content.

### Acceptance Criteria
- [ ] ``app/manager/layout.tsx`` wraps children with AppShell (role=manager)
- [ ] ``app/officer/layout.tsx`` wraps children with AppShell (role=officer)
- [ ] ``app/farmer/layout.tsx`` uses BottomNav only (no sidebar per UX-DR3)
- [ ] TopBar shows user name and sign-out button

**Related:** Story 1.5b
"@ `
    -Labels "bug,architecture,epic-1"

# F3-1: Lot model missing @@map
New-Issue `
    -Title "[F3-1][HIGH] Lot model missing @@map annotation in schema.prisma" `
    -Body @"
## Finding F3-1 — Database Schema Convention Violation

**Severity:** HIGH
**Story:** 1.3 — Database Schema & Prisma Setup
**File:** ``apps/web/prisma/schema.prisma`` (Lot model)

### Problem
``model Lot`` does not have ``@@map("lots")``.
All other models use ``@@map`` for snake_case table names.
Without it, PostgreSQL table will be ``Lot`` (PascalCase) instead of ``lots``.

### Fix
Add to Lot model:
``````prisma
model Lot {
  // ... existing fields ...
  @@map("lots")
}
``````

### Acceptance Criteria
- [ ] ``model Lot`` has ``@@map("lots")``
- [ ] ``npx prisma migrate dev`` creates table named ``lots``
- [ ] All existing Lot queries still work
"@ `
    -Labels "bug,epic-1"

# F4-6: Zod in domain layer
New-Issue `
    -Title "[F4-6][HIGH] Zod schema in domain/ layer violates hexagonal architecture" `
    -Body @"
## Finding F4-6 — Architecture Violation

**Severity:** HIGH
**Story:** 1.4 — Hexagonal Architecture Scaffold
**File:** ``apps/web/src/domain/profile/schemas/htxProfileSchema.ts``

### Problem
``import { z } from 'zod'`` inside ``domain/`` folder.
Domain layer should contain only pure entities, ports, value objects -- no framework imports.

### Fix
- Create ``apps/web/src/lib/validations/`` directory
- Move Zod schemas: ``domain/profile/schemas/`` -> ``lib/validations/``
- Update imports in route handlers

### Acceptance Criteria
- [ ] No ``import { z } from 'zod'`` inside ``domain/`` directory
- [ ] ``lib/validations/htx-profile.schema.ts`` exists
- [ ] All route handlers import Zod schemas from ``lib/validations/``
- [ ] ``grep -r "from 'zod'" apps/web/src/domain`` returns 0 results
"@ `
    -Labels "bug,architecture,epic-1"

# F5-3: any casts
New-Issue `
    -Title "[F5-3][HIGH] Unsafe 'any' casts in auth.ts and middleware.ts without explanation" `
    -Body @"
## Finding F5-3 — TypeScript Safety Violation

**Severity:** HIGH
**Story:** 1.5 — Keycloak Auth
**Files:**
- ``apps/web/src/auth.ts`` (line 14): ``(profile.realm_access as any).roles``
- ``apps/web/src/middleware.ts`` (line 24): ``(req.auth?.user as any)?.role``

### Problem
Rule: "Khong dung 'any' tru khi co comment giai thich ro ly do".
These casts have no explanation and can be eliminated with proper TypeScript augmentation.

### Fix (see Story 1.5e)
``````typescript
// next-auth.d.ts -- add JWT augmentation:
declare module 'next-auth/jwt' {
  interface JWT { role?: 'manager' | 'officer' | 'farmer' }
}

// auth.ts -- typed access:
interface KeycloakProfile { realm_access?: { roles: string[] } }
const roles = (profile as KeycloakProfile).realm_access?.roles ?? []
``````

### Acceptance Criteria
- [ ] No ``as any`` in ``auth.ts``
- [ ] No ``as any`` in ``middleware.ts``
- [ ] ``JWT`` interface augmented in ``next-auth.d.ts``
- [ ] TypeScript strict mode still passes (``npx tsc --noEmit``)

**Related:** Story 1.5e
"@ `
    -Labels "bug,security,epic-1"

# F6-1: No onboarding prompt
New-Issue `
    -Title "[F6-1][HIGH] No onboarding CTA when HTX Profile not yet set up" `
    -Body @"
## Finding F6-1 — Missing Acceptance Criteria

**Severity:** HIGH
**Story:** 1.6 — HTX Profile Page

### Problem
AC: "Given no HTX Profile exists -> onboarding prompt: 'Hay thiet lap thong tin HTX de bat dau.' with [Thiet lap ngay] button".

Current: Shows "Khong tim thay thong tin HTX." in a plain Card -- no CTA button.

### Fix
When ``htxProfile`` is null, render onboarding state with:
- Heading: "Chao mung den DX-AgriMarket!"
- Message: "Hay thiet lap thong tin HTX de bat dau."
- Button (variant=primary): "Thiet lap ngay" -> links to profile edit form

### Acceptance Criteria
- [ ] ``GET /manager/profile`` with no existing profile shows onboarding CTA
- [ ] "Thiet lap ngay" button is present and navigates to edit form
- [ ] No plain "Khong tim thay thong tin HTX." text alone
"@ `
    -Labels "bug,epic-1"

Write-Host ""
Write-Host "=== Creating MEDIUM severity issues ==="

# F1-3: Missing Dockerfile
New-Issue `
    -Title "[F1-3][MEDIUM] Missing Dockerfile for web service" `
    -Body @"
## Finding F1-3 — Missing Dockerfile

**Severity:** MEDIUM
**Story:** 1.1 — Monorepo & Docker Compose Stack
**File:** ``apps/web/Dockerfile`` -- does not exist

### Problem
docker-compose references ``build: context: ../apps/web, dockerfile: Dockerfile``
but no Dockerfile was found. ``docker compose up`` will fail for web service.

### Fix
Create ``apps/web/Dockerfile``:
``````dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV production
EXPOSE 3000
CMD ["npm", "start"]
``````

### Acceptance Criteria
- [ ] ``apps/web/Dockerfile`` exists with multi-stage build
- [ ] ``docker compose build web`` succeeds
- [ ] ``docker compose up web`` starts Next.js on port 3000
"@ `
    -Labels "bug,docker,epic-1"

# F1-5: Keycloak hardcoded credentials
New-Issue `
    -Title "[F1-5][MEDIUM] Keycloak admin credentials hardcoded in docker-compose" `
    -Body @"
## Finding F1-5 — Hardcoded Credentials

**Severity:** MEDIUM
**Story:** 1.1 — Monorepo & Docker Compose Stack

### Problem
``KEYCLOAK_ADMIN: admin`` and ``KEYCLOAK_ADMIN_PASSWORD: admin`` hardcoded.
Rule: "KHONG commit bat ky thu gi vao .env files".

### Fix
Move to environment variables: ``KEYCLOAK_ADMIN`` and ``KEYCLOAK_ADMIN_PASSWORD``.
Add to ``.env.example`` with placeholder values.

### Acceptance Criteria
- [ ] No hardcoded credentials in ``docker-compose.yml``
- [ ] ``.env.example`` contains ``KEYCLOAK_ADMIN`` and ``KEYCLOAK_ADMIN_PASSWORD`` entries
"@ `
    -Labels "bug,security,docker,epic-1"

# F3-2: console.log in seed
New-Issue `
    -Title "[F3-2][MEDIUM] console.log in seed.ts violates no-console rule" `
    -Body @"
## Finding F3-2 — Console Usage in Committed Code

**Severity:** MEDIUM
**Story:** 1.3 — Database Schema & Prisma Setup
**File:** ``apps/web/prisma/seed.ts``

### Problem
Contains ``console.log('Database seeded successfully!')`` and ``.catch(console.error)``.
Rule: "Khong de lai console.log trong committed code".

### Fix
Replace with proper process exit handling:
``````typescript
main()
  .catch((e) => { process.stderr.write(String(e) + '\n'); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
``````

### Acceptance Criteria
- [ ] No ``console.log`` in ``seed.ts``
- [ ] No ``console.error`` in ``seed.ts``
- [ ] Seed still works: ``npx prisma db seed`` succeeds
"@ `
    -Labels "bug,epic-1"

# F4-4: Unexpected presentation layer
New-Issue `
    -Title "[F4-4][MEDIUM] Unexpected presentation/ layer not in architecture spec" `
    -Body @"
## Finding F4-4 — Extra Architecture Layer

**Severity:** MEDIUM
**Story:** 1.4 — Hexagonal Architecture
**File:** ``apps/web/src/presentation/api/withErrorHandler.ts``

### Problem
The 4-layer architecture is: ``app/api -> application -> domain <- infrastructure``.
A ``presentation/`` directory adds an undocumented 5th layer.
``withErrorHandler`` should be in ``app/api/`` or ``lib/api/``.

### Fix
Move ``presentation/api/withErrorHandler.ts`` to ``lib/api/withErrorHandler.ts``.
Update all imports.
Delete ``presentation/`` directory.

### Acceptance Criteria
- [ ] ``presentation/`` directory does not exist
- [ ] ``withErrorHandler`` moved to ``lib/api/`` or ``lib/utils/``
- [ ] All imports updated
"@ `
    -Labels "bug,architecture,epic-1"

# F5-7: JWT type not augmented
New-Issue `
    -Title "[F5-7][MEDIUM] JWT interface not augmented in next-auth.d.ts" `
    -Body @"
## Finding F5-7 — Missing TypeScript Augmentation

**Severity:** MEDIUM
**Story:** 1.5 — Keycloak Auth

### Problem
Only ``Session`` interface augmented. ``JWT`` interface missing ``role`` property.
This forces the ``as any`` casts in ``auth.ts`` and ``middleware.ts``.

### Fix
Add to ``apps/web/src/types/next-auth.d.ts``:
``````typescript
declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'manager' | 'officer' | 'farmer'
  }
}
``````

### Acceptance Criteria
- [ ] ``JWT`` interface has ``role`` typed as union (not string, not any)
- [ ] No TypeScript errors after adding augmentation
- [ ] ``as any`` casts in auth code eliminated

**Related:** F5-3, Story 1.5e
"@ `
    -Labels "bug,epic-1"

# F6-5: GET profile no role check
New-Issue `
    -Title "[F6-5][MEDIUM] GET /api/profile missing manager role check" `
    -Body @"
## Finding F6-5 — Missing Authorization Check

**Severity:** MEDIUM
**Story:** 1.6 — HTX Profile Page
**File:** ``apps/web/src/app/api/profile/route.ts``

### Problem
GET handler checks authentication but not manager role.
Any authenticated user (officer, farmer) can read HTX profile via API.
PUT correctly checks for manager role -- GET should too.

### Fix
Add role check to GET handler:
``````typescript
if (session.user.role !== 'manager') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
``````

### Acceptance Criteria
- [ ] ``GET /api/profile`` returns 403 for officer/farmer roles
- [ ] ``GET /api/profile`` returns 200 for manager role
- [ ] Existing manager profile functionality unchanged
"@ `
    -Labels "bug,security,epic-1"

# F7-3: n8n Error Trigger
New-Issue `
    -Title "[F7-3][MEDIUM] n8n workflows may be missing Error Trigger nodes" `
    -Body @"
## Finding F7-3 — Unverified n8n Workflow Requirement

**Severity:** MEDIUM
**Story:** 1.7 — n8n Market Data Pipelines

### Problem
AC requires each workflow has an Error Trigger node logging failures to notifications table with ``type='system'``.
Workflow JSON content not verified to contain Error Trigger nodes.

### Task
Verify each workflow JSON (``worldbank_sync.json``, ``faostat_sync.json``, ``wto_tariffs.json``, ``nasa_power_sync.json``) contains:
1. Error Trigger node connected to Postgres insert node
2. Insert creates record in ``notifications`` table with ``type='system'``

### Acceptance Criteria
- [ ] Each workflow file has Error Trigger node
- [ ] Error creates ``notifications`` record with ``type='system'``
- [ ] Error handling tested by simulating API failure
"@ `
    -Labels "bug,epic-1"

# FC-3/FC-4: copy-url-button
New-Issue `
    -Title "[FC-3/FC-4][MEDIUM] copy-url-button.tsx not in components/ui/ and uses kebab-case" `
    -Body @"
## Findings FC-3, FC-4 — Component Organization

**Severity:** MEDIUM
**File:** ``apps/web/src/components/copy-url-button.tsx``

### Problem
- FC-3: File directly in ``components/`` root, not ``components/ui/`` as required
- FC-4: Uses kebab-case filename vs PascalCase convention for component files

### Fix
1. Create ``apps/web/src/components/ui/CopyUrlButton/CopyUrlButton.tsx``
2. Create ``apps/web/src/components/ui/CopyUrlButton/CopyUrlButton.module.css``
3. Delete ``components/copy-url-button.tsx`` and ``components/copy-url-button.module.css``
4. Update all imports

### Acceptance Criteria
- [ ] Component at ``components/ui/CopyUrlButton/CopyUrlButton.tsx``
- [ ] CSS Module at ``components/ui/CopyUrlButton/CopyUrlButton.module.css``
- [ ] No files directly in ``components/`` root (only subdirectories)
"@ `
    -Labels "bug,epic-1"

Write-Host ""
Write-Host "=== Creating story issues for new missing stories ==="

# Story 1.2a
New-Issue `
    -Title "[Story 1.2a] Global Error Boundary, Loading & Not-Found Pages" `
    -Body @"
## Story 1.2a — Error Boundary, Loading & Not-Found

**Epic:** 1 — Foundation
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/1-2a-error-boundary-loading.md``

### User Story
As any user (Manager / Officer / Farmer),
I want consistent error, loading, and not-found experiences,
so that unexpected situations are handled gracefully.

### Acceptance Criteria
1. Runtime error -> ``app/error.tsx`` renders with "Thu lai" button (CSS Modules, no console.error)
2. Suspense -> ``app/loading.tsx`` renders Skeleton component
3. Unknown URL -> ``app/not-found.tsx`` renders "Khong tim thay trang" with dashboard link
4. All pages use CSS Modules only (zero inline styles)
5. ``error.tsx`` is ``'use client'`` (Next.js requirement)

### Files to Create
- ``apps/web/src/app/error.tsx``
- ``apps/web/src/app/error.module.css``
- ``apps/web/src/app/loading.tsx``
- ``apps/web/src/app/not-found.tsx``
- ``apps/web/src/app/not-found.module.css``

### Test Plan
See: ``_bmad-output/test-artifacts/test-plan-missing-stories.md`` (Story 1.2a section)
"@ `
    -Labels "story,epic-1"

# Story 1.5a
New-Issue `
    -Title "[Story 1.5a] Login Page -- Full CSS Modules Implementation" `
    -Body @"
## Story 1.5a — Login Page UI Implementation

**Epic:** 1 — Foundation
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/1-5a-login-page-ui.md``

### User Story
As any user, I want a visually polished login page using the design system,
so that my first interaction feels professional and trustworthy.

### Acceptance Criteria
1. ``LoginPage.module.css`` used (NO inline styles, NO Tailwind)
2. Card and Button (variant: primary) from ``@/components/ui`` used
3. Brand name "DX-AgriMarket" and subtitle displayed
4. Loading state shown during Keycloak redirect
5. Green-gradient background; card max-width 400px desktop, full-width mobile
6. Error banner when Keycloak unavailable

### Files to Modify
- ``apps/web/src/app/(auth)/login/page.tsx`` (MODIFY -- remove inline styles)
- ``apps/web/src/app/(auth)/login/LoginPage.module.css`` (MODIFY -- import in page.tsx)

**Fixes:** F2-1, F5-6
"@ `
    -Labels "story,epic-1"

# Story 1.5b
New-Issue `
    -Title "[Story 1.5b] Role-Specific Layout Shells (AppShell Integration)" `
    -Body @"
## Story 1.5b — Role Layouts & AppShell

**Epic:** 1 — Foundation
**Status:** ready-for-dev
**Priority:** CRITICAL (fixes security issues F5-2, F2-5)
**Story File:** ``_bmad-output/implementation-artifacts/1-5b-role-layouts-appshell.md``

### User Story
As any authenticated user, I want a consistent navigation shell tailored to my role.

### Acceptance Criteria
1. ``app/manager/layout.tsx`` wraps with AppShell role=manager, 7 nav items
2. ``app/officer/layout.tsx`` wraps with AppShell role=officer, 6 nav items
3. ``app/farmer/layout.tsx`` uses BottomNav only (no sidebar, UX-DR3)
4. Responsive: sidebar hidden on mobile; BottomNav shown for manager/officer
5. TopBar shows session user name
6. Middleware role protection works: ``/manager/*`` requires manager role

### CRITICAL: Route Fix Required
Move ``app/(manager)/profile/`` -> ``app/manager/profile/``
to fix middleware bypass vulnerability (F5-2)

### Files
- ``app/manager/layout.tsx`` (NEW)
- ``app/officer/layout.tsx`` (NEW)
- ``app/farmer/layout.tsx`` (NEW)
- ``app/manager/profile/page.tsx`` (MOVED from ``(manager)/profile/``)
- ``components/layout/AppShell/AppShell.tsx`` (MODIFY -- accept navItems as props)

**Fixes:** F2-5, F2-6, F2-7, F2-8, F5-2 (SECURITY)
"@ `
    -Labels "story,security,epic-1"

# Story 1.5c
New-Issue `
    -Title "[Story 1.5c] Sign-Out Flow (UserMenu + Keycloak Session Termination)" `
    -Body @"
## Story 1.5c — Sign-Out Flow

**Epic:** 1 — Foundation
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/1-5c-signout-flow.md``

### User Story
As any authenticated user, I want to sign out so my session is terminated.

### Acceptance Criteria
1. TopBar avatar click opens dropdown with role label and "Dang xuat" button
2. Sign-out calls NextAuth signOut() + terminates Keycloak session
3. After sign-out -> redirected to /login
4. JWT expires (8h) -> middleware auto-redirects to /login

### Files
- ``components/layout/TopBar/UserMenu.tsx`` (NEW)
- ``components/layout/TopBar/UserMenu.module.css`` (NEW)
- ``components/layout/TopBar/TopBar.tsx`` (MODIFY)
- ``apps/web/src/auth.ts`` (MODIFY -- add events.signOut handler)

**Fixes:** F5-5
"@ `
    -Labels "story,epic-1"

# Story 1.5d
New-Issue `
    -Title "[Story 1.5d] Unauthorized Page -- Proper Design with CSS Modules" `
    -Body @"
## Story 1.5d — Unauthorized Page UI

**Epic:** 1 — Foundation
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/1-5d-unauthorized-page-ui.md``

### User Story
As a user redirected to /unauthorized, I want a clear, designed error page.

### Acceptance Criteria
1. CSS Modules used (NO inline styles)
2. "403 -- Khong co quyen truy cap" heading
3. "Ban khong co quyen truy cap trang nay." message
4. Button links to role-appropriate dashboard
5. Page centered and responsive

### Files
- ``apps/web/src/app/unauthorized/page.tsx`` (MODIFY -- remove all inline styles)
- ``apps/web/src/app/unauthorized/Unauthorized.module.css`` (NEW)

**Fixes:** F2-2
"@ `
    -Labels "story,epic-1"

# Story 1.5e
New-Issue `
    -Title "[Story 1.5e] SessionProvider Setup & TypeScript JWT Type Augmentation" `
    -Body @"
## Story 1.5e — SessionProvider & Type Safety

**Epic:** 1 — Foundation
**Status:** ready-for-dev
**Priority:** CRITICAL (fixes security type issues)
**Story File:** ``_bmad-output/implementation-artifacts/1-5e-session-provider.md``

### User Story
As a developer, I want SessionProvider and typed session so client components can access user.role safely.

### Acceptance Criteria
1. Root layout wraps children with SessionProvider
2. JWT type augmented with ``role: 'manager' | 'officer' | 'farmer'``
3. No ``any`` casts in auth.ts or middleware.ts
4. useSession() in client components returns typed role
5. providers.tsx is ``'use client'``

### Files
- ``apps/web/src/app/providers.tsx`` (NEW)
- ``apps/web/src/app/layout.tsx`` (MODIFY)
- ``apps/web/src/types/next-auth.d.ts`` (MODIFY)
- ``apps/web/src/auth.ts`` (MODIFY -- remove any casts)
- ``apps/web/src/middleware.ts`` (MODIFY -- remove any casts)

**Fixes:** F5-3, F5-7, FC-2
"@ `
    -Labels "story,security,epic-1"

# Story 1.5f
New-Issue `
    -Title "[Story 1.5f] Keycloak Realm Configuration & Auto-Import JSON" `
    -Body @"
## Story 1.5f — Keycloak Realm Config

**Epic:** 1 — Foundation
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/1-5f-keycloak-realm-config.md``

### User Story
As a developer, I want a pre-configured realm JSON that auto-imports on docker compose up.

### Acceptance Criteria
1. Realm 'agrimarket' auto-imports via ``--import-realm`` flag
2. 3 realm roles: manager, officer, farmer
3. Client 'nextjs-web' configured with correct redirect URIs
4. 3 test users: manager1, officer1, farmer1 (password: Test1234!)
5. WebAuthn + PIN fallback enabled
6. Realm JSON committed to ``docker/keycloak/agrimarket-realm.json``

### Files
- ``docker/keycloak/agrimarket-realm.json`` (NEW)
- ``docker/docker-compose.yml`` (VERIFY -- --import-realm flag)

**Fixes:** F5-4
"@ `
    -Labels "story,epic-1"

# Story 1.8
New-Issue `
    -Title "[Story 1.8] Dashboard Placeholder Pages for All Roles" `
    -Body @"
## Story 1.8 — Dashboard Placeholders

**Epic:** 1 — Foundation
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/1-8-dashboard-placeholders.md``

### User Story
As any authenticated user, I want to land on my role-specific dashboard after login.

### Acceptance Criteria
1. /manager/dashboard renders: role label, available feature links, placeholder sections
2. /officer/dashboard renders similarly
3. /farmer/dashboard renders in single-column layout (UX-DR3)
4. All pages wrapped in AppShell (depends on Story 1.5b)
5. All pages use CSS Modules (no inline styles)

### Files
- ``apps/web/src/app/manager/dashboard/page.tsx`` (MODIFY)
- ``apps/web/src/app/manager/dashboard/Dashboard.module.css`` (NEW)
- ``apps/web/src/app/officer/dashboard/page.tsx`` (MODIFY)
- ``apps/web/src/app/farmer/dashboard/page.tsx`` (MODIFY)

**Note:** Will be replaced by Story 5.1 (Today Dashboard)
"@ `
    -Labels "story,epic-1"

# Story 2.0a
New-Issue `
    -Title "[Story 2.0a] Nominatim Geocode Proxy API Endpoint" `
    -Body @"
## Story 2.0a — Geocode Proxy

**Epic:** 2 — Market Intelligence
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/2-0a-geocode-proxy-api.md``

### User Story
As a developer, I want a /api/geocode proxy endpoint for Nominatim address search,
so that client components never call external APIs directly (AD-10).

### Acceptance Criteria
1. GET /api/geocode?q=<term> returns ``{ results: [{ display_name, lat, lon }] }``
2. Unauthenticated -> 401
3. Rate limiting: max 1 req/sec per IP (Nominatim ToS)
4. Empty q param -> 400
5. Hexagonal: Zod validate -> NominatimAdapter -> response
6. User-Agent header: "DX-AgriMarket/1.0"

### Files
- ``apps/web/src/app/api/geocode/route.ts`` (NEW)
- ``apps/web/src/domain/shared/ports/GeocodingPort.ts`` (NEW)
- ``apps/web/src/infrastructure/geocoding/NominatimAdapter.ts`` (NEW)
- ``apps/web/src/lib/validations/geocode.schema.ts`` (NEW)

**Required by:** Story 2.6 (Partner Map), Story 3.2 (Parcel Drawing)
"@ `
    -Labels "story,epic-2"

# Story 2.3a
New-Issue `
    -Title "[Story 2.3a] Piper TTS API Route & Infrastructure Adapter" `
    -Body @"
## Story 2.3a — TTS API Endpoint

**Epic:** 2 — Market Intelligence
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/2-3a-tts-api-endpoint.md``

### User Story
As a developer, I want POST /api/tts that synthesizes Vietnamese text via Piper,
so all TTS features share a single reliable backend adapter.

### Acceptance Criteria
1. POST /api/tts ``{ text: string }`` (max 500 chars) -> returns audio/wav stream
2. GET /api/tts/status -> ``{ available: boolean }``
3. Piper unavailable -> 503 with Vietnamese message
4. Empty/long text -> 400
5. Unauthenticated -> 401
6. Hexagonal: Zod -> PiperTtsAdapter -> stream

### Files
- ``apps/web/src/app/api/tts/route.ts`` (NEW)
- ``apps/web/src/app/api/tts/status/route.ts`` (NEW)
- ``apps/web/src/domain/shared/ports/TtsPort.ts`` (NEW)
- ``apps/web/src/infrastructure/tts/PiperTtsAdapter.ts`` (NEW)

**Required by:** Story 2.3 (Bulletin TTS), Story 2.7 (Notifications), Story 5.1 (Today Dashboard)
"@ `
    -Labels "story,epic-2"

# Story 3.5a
New-Issue `
    -Title "[Story 3.5a] Weather Data API Endpoint (Open-Meteo + Cache)" `
    -Body @"
## Story 3.5a — Weather API Endpoint

**Epic:** 3 — Farm Zone & Journal
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/3-5a-weather-api-endpoint.md``

### User Story
As a developer, I want GET /api/weather returning cached weather data for journal auto-fill.

### Acceptance Criteria
1. GET /api/weather?date=YYYY-MM-DD&parcelId=<uuid> -> ``{ data: { condition, temperature_c, precipitation_mm, humidity_pct } }``
2. Cache miss -> falls back to Open-Meteo, stores in weather_cache
3. Response time < 2 seconds (cache hit < 100ms)
4. Invalid date -> 400; invalid parcelId -> 404; unauthenticated -> 401
5. Hexagonal: Zod -> GetWeatherUseCase -> WeatherCacheRepo + OpenMeteoAdapter

### Files
- ``apps/web/src/app/api/weather/route.ts`` (NEW)
- ``apps/web/src/application/farm/GetWeatherUseCase.ts`` (NEW)
- ``apps/web/src/infrastructure/weather/OpenMeteoAdapter.ts`` (NEW)
- ``apps/web/src/infrastructure/db/farm/PrismaWeatherCacheRepository.ts`` (NEW)

**Required by:** Story 3.3, Story 3.5
"@ `
    -Labels "story,epic-3"

# Story 4.6a
New-Issue `
    -Title "[Story 4.6a] Disease Diagnosis API Proxy (FastAPI Bridge + AI Invariants)" `
    -Body @"
## Story 4.6a — Diagnosis Proxy API

**Epic:** 4 — QR Traceability & Disease Detection
**Status:** ready-for-dev
**Story File:** ``_bmad-output/implementation-artifacts/4-6a-diagnosis-proxy-api.md``

### User Story
As a developer, I want POST /api/diagnosis that proxies to FastAPI disease-api and enforces AI Invariants.

### Acceptance Criteria
1. POST /api/diagnosis with image + parcelId -> validates, proxies to disease-api, creates DiseaseReport + MinIO photo + Officer Notification -> returns ``{ disease_name, confidence_score, report_id }``
2. Non-farmer role -> 403
3. disease-api unavailable -> 503
4. **CRITICAL AI Invariant:** Response MUST NOT contain ``treatment`` or ``recommendation`` fields
5. Photo uploaded to MinIO (15min pre-signed URL)
6. Officer notification created (type='disease_report')

### AI Invariant (NON-NEGOTIABLE)
Per AGENTS.md: "KHONG tra ve treatment/recommendation -- chi disease_name + confidence_score"

### Files
- ``apps/web/src/app/api/diagnosis/route.ts`` (NEW)
- ``apps/web/src/domain/disease/ports/DiseaseDetectionPort.ts`` (NEW)
- ``apps/web/src/application/disease/SubmitDiagnosisUseCase.ts`` (NEW)
- ``apps/web/src/infrastructure/disease-api/DiseaseApiAdapter.ts`` (NEW)
- ``apps/web/src/infrastructure/storage/MinioStorageAdapter.ts`` (NEW)

**Required by:** Story 5.3, Story 5.4
"@ `
    -Labels "story,security,epic-4"

Write-Host ""
Write-Host "=== All issues created successfully! Total: $issueCount ==="
