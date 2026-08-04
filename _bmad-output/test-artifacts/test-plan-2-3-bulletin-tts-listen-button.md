# 🧪 Test Plan — Story 2.3: Bulletin TTS "Listen" Button

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 2.3 — Bulletin TTS "Listen" Button (Piper Integration)
**Date:** 2026-08-05
**Risk Level:** 🔴 HIGH — Piper integration via Wyoming protocol is a known gotcha. Audio streaming logic in Next.js API routes can be fragile.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Next.js API route fails to connect to Piper | HIGH | HIGH | Docker compose network check; proxy script test |
| Audio stream cuts off prematurely | MEDIUM | MEDIUM | Stream chunking test |
| Markdown syntax read aloud by TTS | HIGH | LOW | Unit test the markdown stripping logic |
| Client `<audio>` element doesn't play the stream | LOW | HIGH | E2E or manual test across browsers |

---

## Test Strategy for Story 2.3

### Approach

We will unit test the markdown stripping logic heavily. We will integration test the `/api/tts` endpoint by mocking the Piper response. An E2E test will verify the button interaction.

**Test files location:**
- `apps/web/src/__tests__/utils/`
- `apps/web/src/__tests__/presentation/api/`
- `apps/web/tests/e2e/bulletin/`

---

## Test Cases

### TC-2.3-01: Markdown Stripping Utility (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

```typescript
// __tests__/utils/stripMarkdown.test.ts
import { stripMarkdown } from '@/utils/stripMarkdown' // Assume this is extracted

describe('stripMarkdown', () => {
  it('removes headings', () => {
    expect(stripMarkdown('## Tiêu đề chính')).toBe('Tiêu đề chính')
  })

  it('removes bold and italic', () => {
    expect(stripMarkdown('Giá **tăng** *mạnh*')).toBe('Giá tăng mạnh')
  })

  it('removes lists', () => {
    expect(stripMarkdown('- Mục 1\n- Mục 2')).toBe('Mục 1\nMục 2')
  })

  it('removes citations', () => {
    expect(stripMarkdown('Theo nguồn [1]')).toBe('Theo nguồn ')
  })
})
```

**Pass Criteria:** Text is stripped down to plain words suitable for TTS reading.
**Fail Criteria:** Formatting artifacts remain.

---

### TC-2.3-02: API Route Response Format (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Mock the database call to return a valid bulletin. Mock the fetch/call to the Piper service to return a dummy `ReadableStream`. Test that `GET /api/tts?bulletinId=1` returns a response with `Content-Type: audio/wav`.

**Pass Criteria:** Route returns a 200 OK with the correct content type.
**Fail Criteria:** Returns 500 or plain text.

---

### TC-2.3-03: Audio Player Component State (Unit)

**Type:** Unit
**Tool:** Jest + RTL
**Priority:** P1

**Test Concept:**
Render `<AudioPlayer bulletinId="1" />`.
1. Initially shows "Nghe bản tin" (Play icon).
2. Click button -> Shows loading state.
3. Once `<audio>` emits `play` event -> Shows "Pause" icon.

**Pass Criteria:** UI updates based on audio element state.
**Fail Criteria:** Stuck in loading state.

---

## Test Execution Plan

```
P0 (blocking):
  TC-2.3-01 → TC-2.3-02

P1:
  TC-2.3-03
```

---

## Definition of Done for Story 2.3

- [ ] `TC-2.3-01` PASS: Markdown stripper works.
- [ ] `TC-2.3-02` PASS: API route returns audio stream.
- [ ] `TC-2.3-03` PASS: Audio player component handles state.
- [ ] Manual check: Audio actually plays and sounds like Vietnamese.
- [ ] Committed with: `feat(market): add tts audio player to bulletin using piper`

---

*🧪 Murat notes: The hardest part of this story isn't the React component, it's the Docker networking between Next.js and Piper. Focus your integration testing effort there.*
