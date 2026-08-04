# 🧪 Test Plan — Story 5.4: PWA Offline Disease Diagnosis

**Authored by:** Murat
**Story:** 5.4

---

## Detailed Test Cases

### TC-5.4-01: Offline Queuing (E2E)
**Type:** E2E
**Tool:** Playwright
**Target File:** `tests/e2e/pwa/offline-diagnosis.spec.ts`
**Execution:**
1. Navigate to `/farmer/diagnosis`.
2. `context.setOffline(true)`.
3. Submit image. Assert UI shows "Saved offline".
4. Assert no network request failed or fired.
5. `context.setOffline(false)`.
6. Assert network request to `/api/diagnosis` is fired automatically.
