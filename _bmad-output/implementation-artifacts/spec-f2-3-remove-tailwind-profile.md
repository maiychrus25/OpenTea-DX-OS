---
title: '[F2-3][HIGH] Profile page uses Tailwind classes'
type: 'bugfix'
created: '2026-08-12T18:57:00'
status: 'done'
baseline_commit: '149a5b737fc6b0bb4cad3aecf7512161a3f220c3'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `profile/page.tsx` uses Tailwind CSS classes (`p-6 max-w-4xl mx-auto w-full`, etc.) which violates the project's strict "No Tailwind" invariant rule.
**Approach:** Remove all Tailwind classes from `apps/web/src/app/(manager)/profile/page.tsx` and replace them with standard CSS Modules (`page.module.css`), utilizing the design tokens defined in `globals.css` to maintain visual consistency while adhering to architectural rules.

## Boundaries & Constraints

**Always:**
- Use CSS Modules (`.module.css`) for component styling.
- Rely on existing CSS variables/design tokens from `styles/globals.css` (e.g., spacing, colors, typography).
- Verify quality by running unit tests, e2e tests, and build checks before concluding.

**Ask First:**
- Adding new CSS variables to `globals.css`. (A senior dev with 15+ years avoids polluting global scope unless strictly necessary and reusable).
- Committing or pushing code (explicitly forbidden by user request).

**Never:**
- Leave inline styles or Tailwind classes.
- Use arbitrary magic numbers in CSS if a token exists.

</frozen-after-approval>

## Code Map

- `apps/web/src/app/(manager)/profile/page.tsx` -- The page component currently violating the No-Tailwind rule.
- `apps/web/src/app/(manager)/profile/page.module.css` -- The new CSS module file to be created for styling the page.
- `apps/web/src/styles/globals.css` -- Reference for existing design tokens.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/app/(manager)/profile/page.module.css` -- Create new CSS module -- define styles using global design tokens to replicate the layout and typography previously handled by Tailwind.
- [x] `apps/web/src/app/(manager)/profile/page.tsx` -- Remove Tailwind classes and import/apply styles from `page.module.css`.

**Acceptance Criteria:**
- Given a developer inspects `profile/page.tsx`, when they look at the `className` attributes, then no Tailwind classes are present.
- Given the profile page is rendered, when viewed in the browser, then it maintains the same visual layout (padding, max-width, typography) as before.

### Review Findings
- [x] [Review][Patch] Missing `font-weight: bold` on `.title` [`page.module.css:19`]
- [ ] [Review][Patch] Unintended modification of `package-lock.json` [`package-lock.json`]
- [x] [Review][Patch] Remove historical comment from CSS [`page.module.css:5`]
- [x] [Review][Patch] Remove redundant `box-sizing: border-box` [`page.module.css:9`]
- [x] [Review][Patch] Revert `<main>` back to `<div>` to avoid semantics clash [`page.tsx:17`]
- [x] [Review][Patch] Fix incorrect token for body text instead of `--font-size-label` [`page.module.css:27`]
- [x] [Review][Patch] Remove overengineered flexbox from `.header`, restore simple margin [`page.module.css:12`]

## Verification

**Commands:**
- `npm run lint` -- expected: No linting errors.
- `npm run test` (or equivalent unit test command) -- expected: Tests pass.
- `npm run build` -- expected: Application builds successfully without CSS module resolution errors.
- `npm run e2e` (if available) -- expected: End-to-end tests pass.

## Suggested Review Order

- Replaced Tailwind with semantic CSS Module for styling the Profile Page.
  [`page.tsx:16`](../../apps/web/src/app/(manager)/profile/page.tsx#L16)

- Defined responsive layout and typography tokens in CSS Module.
  [`page.module.css:4`](../../apps/web/src/app/(manager)/profile/page.module.css#L4)

