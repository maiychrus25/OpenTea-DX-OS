# Story 5.8: n8n Weekly Officer Reminder

Status: ready-for-dev

## Story

As a Manager,
I want the system to automatically send a weekly summary to the Mattermost channel detailing how many `PENDING` journals and disease reports the Officers still need to review,
so that the team stays accountable and nothing falls through the cracks.

## Dependencies
- **Depends on:** 3.6, 5.5
- **Blocks:** None

## Acceptance Criteria

1. **Given** the n8n automation engine **When** it is Friday at 16:00 **Then** a scheduled workflow triggers.
2. **Given** the workflow is triggered **When** it executes **Then** it queries the Postgres DB directly to count `JournalEntry` (where `status = 'PENDING'`) and `DiseaseReport` (where `status = 'PENDING'`).
3. **Given** the counts **When** they are greater than zero **Then** n8n formats a message and sends it via HTTP Request node to the Mattermost Webhook URL.
4. **Given** the workflow architecture **When** it runs **Then** it requires NO code changes in the Next.js application, strictly adhering to the background architecture invariant.

## Tasks / Subtasks

- [ ] **T1: n8n Workflow Configuration**
  - [ ] Create `workflows/weekly_officer_reminder.json`.
  - [ ] Node 1: Cron Node (Schedule: Weekly, Friday 16:00).
  - [ ] Node 2: Postgres Node (Query: `SELECT count(*) from journal_entries WHERE status = 'PENDING'`).
  - [ ] Node 3: Postgres Node (Query: `SELECT count(*) from disease_reports WHERE status = 'PENDING'`).
  - [ ] Node 4: IF Node (Are counts > 0?).
  - [ ] Node 5: HTTP Request Node (POST to Mattermost Webhook, formatting the data into a markdown message).

## Dev Notes

- This is purely an infrastructure configuration task for n8n. No TypeScript or Next.js work is required.

## File List

**Files to CREATE:**
- `workflows/weekly_officer_reminder.json`

**Files to UPDATE:**
- N/A
