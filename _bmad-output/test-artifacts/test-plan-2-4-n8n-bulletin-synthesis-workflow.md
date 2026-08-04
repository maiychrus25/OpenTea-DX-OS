# 🧪 Test Plan — Story 2.4: n8n Bulletin Synthesis Workflow

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 2.4 — n8n Bulletin Synthesis Workflow (Ollama)
**Date:** 2026-08-05
**Risk Level:** 🔴 HIGH — Integrating an LLM brings unpredictable outputs. If the model hallucinations violate the invariant (e.g., recommends selling), HTX risks liability.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| LLM gives actionable trading advice | HIGH | CRITICAL | Strict prompt engineering; output regex check (optional) |
| Ollama container is slow/times out | MEDIUM | HIGH | n8n HTTP node timeout config; model choice (phi3:mini) |
| Concurrent runs create multiple `is_latest = true` | LOW | MEDIUM | DB transaction or precise update sequencing |
| LLM returns invalid markdown/JSON | MEDIUM | LOW | n8n parse error handling |

---

## Test Strategy for Story 2.4

### Approach

Testing LLM workflows requires probabilistic testing or strict output validation. We will write an integration test that checks the generated record in the database for invariant compliance (no banned words like "khuyên", "nên bán").

**Test files location:** `apps/web/src/__tests__/infrastructure/n8n/`

---

## Test Cases

### TC-2.4-01: Synthesis Output Purity (Integration)

**Type:** Integration
**Tool:** Jest + Prisma
**Priority:** P0

**Test Concept:**
1. Ensure the `Bulletin_Synthesis` workflow has run (trigger manually).
2. Fetch the latest bulletin from the database.
3. Assert that it contains citations (`[1]`).
4. Assert that it does NOT contain recommendation keywords.

```typescript
// __tests__/infrastructure/n8n/bulletin-synthesis.test.ts
import { prisma } from '@/infrastructure/db/prisma.client'

describe('Bulletin Synthesis Workflow Output', () => {
  it('generates a bulletin adhering to invariants', async () => {
    const latest = await prisma.bulletin.findFirst({
      where: { is_latest: true },
      orderBy: { created_at: 'desc' }
    })
    
    expect(latest).toBeDefined()
    
    const text = latest?.bulletin_vi || ''
    
    // Invariant 1: Must contain citations
    expect(text).toMatch(/\[\d+\]/)
    
    // Invariant 2 & 3: Must NOT contain advice
    const bannedPhrases = [
      'khuyên bà con', 
      'nên bán', 
      'nên giữ', 
      'khuyến nghị',
      'đề nghị'
    ]
    
    for (const phrase of bannedPhrases) {
      expect(text.toLowerCase()).not.toContain(phrase)
    }
  })
})
```

**Pass Criteria:** The LLM output strictly adheres to the negative constraints and formatting rules.
**Fail Criteria:** Banned words are present, or citations are missing.

---

### TC-2.4-02: `is_latest` Flag Toggling (Integration)

**Type:** Integration
**Tool:** Jest + Prisma
**Priority:** P1

**Test Concept:**
Verify that there is exactly ONE record per commodity where `is_latest = true`.

```typescript
// __tests__/infrastructure/n8n/bulletin-latest-flag.test.ts
import { prisma } from '@/infrastructure/db/prisma.client'

it('maintains exactly one is_latest=true record per commodity', async () => {
  const latestCount = await prisma.bulletin.count({
    where: { commodity: 'Gạo', is_latest: true }
  })
  
  expect(latestCount).toBeLessThanOrEqual(1) // 0 is fine if none run yet, but never >1
})
```

**Pass Criteria:** Count is 0 or 1.
**Fail Criteria:** Count > 1.

---

## Test Execution Plan

```
P0 (blocking):
  TC-2.4-01

P1 (important):
  TC-2.4-02
```

---

## Definition of Done for Story 2.4

- [ ] `TC-2.4-01` PASS: AI output respects constraints.
- [ ] `TC-2.4-02` PASS: State management (`is_latest`) is correct.
- [ ] The JSON workflow file is committed to `workflows/`.
- [ ] Committed with: `feat(n8n): add ai bulletin synthesis workflow`

---

*🧪 Murat notes: The real test of an LLM feature isn't just "does it return a string", it's "does it break the rules". Banned-word lists aren't perfect, but they are a pragmatic automated safety net against hallucinations.*
