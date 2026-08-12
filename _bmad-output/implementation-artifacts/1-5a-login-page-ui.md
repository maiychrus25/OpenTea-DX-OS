# Story 1.5a: Login Page — Full UI Implementation

Status: ready-for-dev

## Story

As any user (Manager / Officer / Farmer),
I want a visually polished login page that uses the project design system,
so that my first interaction with the system feels professional and trustworthy.

## Acceptance Criteria

1. **Given** a user navigates to `/login` → page uses `LoginPage.module.css` (CSS Modules, NO inline styles, NO Tailwind classes)
2. `Card` and `Button` (variant: primary) from `@/components/ui` are used — no raw HTML elements
3. DX-AgriMarket brand name and subtitle "Hệ điều hành số Nông nghiệt" are displayed with design system typography
4. Loading state shown while redirecting to Keycloak via `Button isLoading` prop
5. Page is centered with green-gradient background; card `max-width: 400px` on desktop, full-width on mobile
6. **Given** Keycloak unavailable → error banner: "Không thể kết nối máy chủ xác thực. Vui lòng thử lại sau."

## Tasks / Subtasks

- [ ] Rewrite `apps/web/src/app/(auth)/login/page.tsx` (AC: 1, 2, 3, 4, 6)
  - [ ] Remove ALL inline `style={{}}` attributes (currently present — violates AD-6)
  - [ ] Import `Card`, `Button` from `@/components/ui`
  - [ ] Import `LoginPage.module.css` (file exists but is NOT imported — fix this)
  - [ ] Add loading state during signIn redirect
  - [ ] Add error handling for Keycloak unavailable
- [ ] Rewrite `apps/web/src/app/(auth)/login/LoginPage.module.css` (AC: 1, 5)
  - [ ] Use tokens: `--color-primary`, `--color-surface-card`, `--font-size-heading-3`, `--spacing-*`
  - [ ] Add green-gradient background for `.container`
  - [ ] Responsive: card full-width on `< 640px`
- [ ] Add loading state management (AC: 4)
  - [ ] Use React `useState` + `useTransition` OR Server Action pending state

## Dev Notes

### Current State (Read This Before Implementing)
- `login/page.tsx` currently has inline `style={{ display: 'flex', justifyContent: 'center', ... }}` everywhere
- `LoginPage.module.css` exists with correct class names (`.container`, `.card`, `.title`, `.subtitle`, `.form`, `.submitButton`) BUT is NOT imported in `page.tsx`
- The login uses a Server Action calling `signIn("keycloak")` — keep this pattern

### Architecture Pattern
- Server Component + Server Action for signIn (do NOT convert to Client Component unless needed for loading state)
- If loading state needed: use `useFormStatus` hook from `react-dom` in a separate client sub-component
- Pattern: `LoginPage.tsx` (Server) renders `LoginForm.tsx` (Client) which has the button with pending state

### CSS Tokens to Use (from globals.css)
```css
/* CORRECT tokens */
--color-primary: ...
--color-surface-card: ...
--color-ink-primary: ...
--color-ink-secondary: ...
--font-size-heading-3: ...
--font-size-body: ...
--spacing-4, --spacing-6, --spacing-8: ...
--rounded-md: ...
```

### Project Structure Notes
- Login page is under `(auth)/login/` — route group, no URL segment
- The `(auth)/layout.tsx` should NOT include AppShell (unauthenticated page)
- `Button` component supports `isLoading` and `variant` props — check `components/ui/Button/Button.tsx`

### References
- [Source: apps/web/src/app/(auth)/login/page.tsx — current implementation with inline styles]
- [Source: apps/web/src/app/(auth)/login/LoginPage.module.css — CSS file (exists but unused)]
- [Source: apps/web/src/components/ui/Button/Button.tsx — Button component API]
- [Source: apps/web/src/auth.ts — signIn function]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/(auth)/login/page.tsx` (MODIFY)
- `apps/web/src/app/(auth)/login/LoginPage.module.css` (MODIFY)
