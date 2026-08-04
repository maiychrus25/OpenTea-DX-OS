# 🧪 Test Plan — Story 5.5: Officer Disease Report Review

**Authored by:** Murat
**Story:** 5.5

---

## Detailed Test Cases

### TC-5.5-01: Update and Notify (Integration)
**Type:** Integration
**Tool:** Jest
**Execution:** Call `ReviewDiseaseReportUseCase` with mock treatment. Assert DB updates to `APPROVED` and `INotificationRepository.createMany` is called.
