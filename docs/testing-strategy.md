# Testing Strategy — OpenTea DX-OS

This document outlines the testing stack and strategy for the project. All AI agents (specifically `bmad-tea` or developer agents) MUST adhere to these choices when writing test plans or implementing test code.

## 1. Testing Stack

The project uses the following established stack for testing:

- **Unit & Integration Testing (Backend & Frontend Logic):**
  - Framework: [Jest](https://jestjs.io/)
  - Assertions: `expect` (Jest built-in)
  - Mocking: Jest functions (`jest.fn()`, `jest.spyOn()`, `jest.mock()`)
  
- **Frontend Component Testing (React):**
  - Library: [React Testing Library (RTL)](https://testing-library.com/)
  - User Interactions: `@testing-library/user-event`
  
- **End-to-End (E2E) Testing:**
  - Framework: [Playwright](https://playwright.dev/)
  - Purpose: Cross-browser UI testing, complex user flows (Auth, Map rendering, CRUD).

## 2. Test Pyramid & Scope

### Unit Tests
- **Focus:** Domain schemas (Zod), Use Cases (mocking repositories), utility functions, and isolated UI components.
- **Rule:** Do NOT connect to the database. Use strict dependency injection and mocks.

### Integration Tests
- **Focus:** Next.js API Routes (`app/api/*/route.ts`), Middleware, and Repository adapters.
- **Rule:** It is permissible to hit a local seeded test database (via Prisma) to ensure SQL queries and relations are correct.

### E2E Tests (Playwright)
- **Focus:** Complete user journeys (e.g., logging in, navigating to a map, submitting a form, verifying toast notification).
- **Rule:** Mock external APIs (e.g., Open-Meteo) but try to test against the real database and auth provider (Keycloak) if locally available via Docker.

## 3. Test File Locations

Tests should be co-located or organized in `__tests__` folders mimicking the `src` structure:

- Unit & Integration: `apps/web/src/__tests__/...`
- Playwright E2E: `apps/web/tests/e2e/...`

## 4. Test Documentation (Test Plans)

Before any code is written for a Story, a Test Plan must be generated (typically by the `bmad-tea` agent/Murat persona).
- **Format:** Markdown
- **Location:** `_bmad-output/test-artifacts/test-plan-[story-id].md`
- **Content:** Must include Risk Assessment, Strategy, and explicit Test Cases covering Unit, Integration, and E2E as appropriate.
