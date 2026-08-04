# 🧪 Test Plan — Story 5.3: Farmer Disease Diagnosis UI

**Authored by:** Murat
**Story:** 5.3

---

## Detailed Test Cases

### TC-5.3-01: API Proxy & DB Creation (Integration)
**Type:** Integration
**Tool:** Jest
**Target File:** `src/application/useCases/disease/DiagnoseDiseaseUseCase.test.ts`
**Execution:**
1. Mock `DiseaseAiAdapter` to return `{ disease_name: 'Đạo ôn', confidence_score: 0.95 }`.
2. Mock `StoragePort` to return a fake URL.
3. Call use case. Assert `IDiseaseReportRepository.create` is called with status `PENDING` and the exact AI name.

### TC-5.3-02: Mobile Camera Prop (Unit)
**Type:** Unit
**Tool:** RTL
**Execution:** Assert `<input>` has `capture="environment"`.
