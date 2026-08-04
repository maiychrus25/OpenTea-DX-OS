# 🧪 Test Plan — Story 6.3: Technical Expert Chatbot

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 6.3 — Technical Expert Chatbot
**Date:** 2026-08-05
**Risk Level:** 🟡 MEDIUM — Generative AI behavior. Must strictly enforce the invariant.

---

## Test Cases

### TC-6.3-01: Context Injection (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Mock the `TechnicalDocumentService` to return a specific dummy text ("The HTX policy states 10 days of rest"). Test the API route logic to ensure this string is correctly formatted into the `system` prompt passed to Ollama.

### TC-6.3-02: Citation Requirement (Manual / E2E)

**Type:** Manual (Playwright can verify presence of a source box)
**Priority:** P0

**Test Concept:**
Prompt the chatbot with a question. Assert that the response explicitly includes a citation or reference to the source document, adhering to the AI invariant.

---

## Definition of Done

- [ ] `TC-6.3-01` PASS: Document text is injected into prompt.
- [ ] `TC-6.3-02` PASS: Bot cites sources.
- [ ] Committed with: `feat(ai): implement technical expert chatbot with poor mans rag`
