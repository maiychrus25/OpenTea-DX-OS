# 🧪 Test Plan — Story 5.8: n8n Weekly Officer Reminder

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 5.8 — n8n Weekly Officer Reminder
**Date:** 2026-08-05
**Risk Level:** 🟢 LOW — External n8n configuration.

---

## Test Cases

### TC-5.8-01: Postgres Query Validation (Manual)

**Type:** Manual
**Priority:** P0

**Test Concept:**
Execute the `workflows/weekly_officer_reminder.json` manually in the n8n UI. Ensure the Postgres nodes correctly connect and return accurate counts of PENDING records.

### TC-5.8-02: Mattermost Delivery (Manual)

**Type:** Manual
**Priority:** P1

**Test Concept:**
Ensure the final HTTP request node successfully delivers the payload to the Mattermost channel.

---

## Definition of Done

- [ ] `TC-5.8-01` PASS: Queries work in n8n.
- [ ] `TC-5.8-02` PASS: Message delivered to Mattermost.
- [ ] Committed with: `feat(automation): add n8n weekly reminder workflow`
