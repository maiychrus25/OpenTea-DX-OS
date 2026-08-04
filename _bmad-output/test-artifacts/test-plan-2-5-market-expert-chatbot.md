# 🧪 Test Plan — Story 2.5: Market Expert Chatbot

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 2.5 — Market Expert Chatbot
**Date:** 2026-08-05
**Risk Level:** 🔴 HIGH — Vercel AI SDK streaming integration with local Ollama can be tricky (network timeouts). AI hallucination risk is high.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Context retrieval fetches wrong data | MEDIUM | MEDIUM | Unit test keyword matching logic |
| Ollama times out during generation | HIGH | HIGH | Set appropriate abort signals / timeout configs |
| AI hallucination violates invariant | HIGH | CRITICAL | Mock the AI response in tests, rely on system prompt |
| Chat history fails to save | LOW | MEDIUM | Integration test `onFinish` callback logic |

---

## Test Strategy for Story 2.5

### Approach

1. **Unit:** Test the `RetrieveMarketContextUseCase` to ensure it formats DB records correctly into a text string.
2. **Integration:** Test the `POST /api/chat` endpoint by mocking the `streamText` function from the AI SDK.
3. **E2E:** Not strictly necessary for the streaming internals if unit/integration tests cover it, but a manual check is required.

**Test files location:**
- `apps/web/src/__tests__/application/useCases/`
- `apps/web/src/__tests__/presentation/api/`

---

## Test Cases

### TC-2.5-01: Context Retrieval Formatting (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P1

**Test Concept:**
Mock the database repositories to return specific MarketData and Weather records. Call `RetrieveMarketContextUseCase.execute('giá lúa')`. Assert that the returned string contains the mocked data formatted cleanly (e.g., "Gạo: 15000 VND").

**Pass Criteria:** Context string includes relevant data.
**Fail Criteria:** Returns empty or malformed string.

### TC-2.5-02: AI Streaming Route (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Mock the `@ai-sdk/ollama` provider. Send a POST request to `/api/chat` with `{ messages: [{ role: 'user', content: 'hello' }] }`. Assert that it returns a 200 response with `Transfer-Encoding: chunked` or a readable stream.

**Pass Criteria:** Returns a stream.
**Fail Criteria:** Returns a static 500 error.

### TC-2.5-03: Save Chat History (Integration)

**Type:** Integration
**Tool:** Jest + Prisma
**Priority:** P1

**Test Concept:**
After a successful (mocked) completion of the chat stream, verify that `ChatHistory` has a new record containing both the user's message and the AI's response.

**Pass Criteria:** DB record created.
**Fail Criteria:** No record created (often happens if `onFinish` throws an unhandled error).

---

## Test Execution Plan

```
P0: TC-2.5-02
P1: TC-2.5-01 → TC-2.5-03
```

---

## Definition of Done for Story 2.5

- [ ] `TC-2.5-01` PASS: Context retrieved and formatted.
- [ ] `TC-2.5-02` PASS: API route streams response.
- [ ] `TC-2.5-03` PASS: History is saved.
- [ ] Manual check: System prompt strictness verified against a malicious prompt (e.g., "khuyên tôi nên làm gì").
- [ ] Committed with: `feat(chat): implement market expert chatbot with vercel ai sdk and ollama`

---

*🧪 Murat notes: Testing streaming endpoints in Jest can be annoying. If `TC-2.5-02` proves too difficult to mock properly with the AI SDK, focus on extracting the Prompt Construction logic into a pure function and unit testing that instead, leaving the actual stream to manual testing.*
