# Story 2.4: n8n Bulletin Synthesis Workflow (Ollama)

Status: ready-for-dev

## Story

As a developer,
I want an n8n workflow that uses Ollama to synthesize raw market data into a readable daily bulletin,
so that the Next.js application has fresh, AI-generated insights to display to users every morning.

## Dependencies
- **Depends on:** 2.3
- **Blocks:** 2.5

## Acceptance Criteria

1. **Given** the n8n docker service **When** I log in **Then** I see the `Bulletin_Synthesis` workflow.
2. **Given** the workflow is triggered (e.g., daily at 6:00 AM) **When** it runs **Then** it queries the `MarketData` and `FxRate` tables for the latest records.
3. **Given** the raw data **When** passed to the Ollama node **Then** Ollama (using the `OLLAMA_MODEL` from env) generates a Vietnamese Markdown summary adhering to the strict prompt rules (No recommendations, cite sources, state facts only).
4. **Given** the generated summary **When** the workflow completes **Then** it inserts a new record into the `Bulletin` table (with `is_latest = true`) and sets `is_latest = false` for the previous bulletin of that commodity.
5. **Given** the finalized workflow **When** I export it **Then** it is saved as `workflows/bulletin_synthesis.json` and committed to the repository.

## Tasks / Subtasks

- [ ] **T1: n8n Workflow Setup** (AC: 1, 2)
  - [ ] Create workflow triggered by a daily Cron node (e.g., 6:00 AM).
  - [ ] Add Postgres nodes to query the latest `MarketData` (e.g., Rice prices) and `FxRate`.
  - [ ] Format the queried data into a JSON string or text block to feed to the LLM.

- [ ] **T2: Ollama Integration** (AC: 3)
  - [ ] Add the Basic LLM Chain or HTTP Request node to call the local Ollama service (`http://ollama:11434/api/generate`).
  - [ ] **Prompt Engineering:** Include the AI invariants strictly.
    - *System Prompt:* "Bạn là chuyên gia phân tích thị trường nông sản. 1. CHỈ trình bày sự thật có trích dẫn nguồn. 2. KHÔNG ra quyết định thay HTX. 3. KHÔNG khuyến nghị hành động cụ thể. 4. Mọi số liệu phải kèm nguồn [1], [2]..."
    - *User Prompt:* Inject the JSON data fetched in T1.
  - [ ] Parse the markdown response from Ollama.

- [ ] **T3: Database Update Logic** (AC: 4)
  - [ ] Add Postgres node to execute: `UPDATE "Bulletin" SET is_latest = false WHERE commodity = $1`.
  - [ ] Add Postgres node to execute: `INSERT INTO "Bulletin" (id, commodity, bulletin_vi, sources_json, model_used, is_latest, created_at) VALUES (...)`. Note: `id` can be generated using n8n crypto node (UUID) or rely on Postgres default if configured.

- [ ] **T4: Export and Commit** (AC: 5)
  - [ ] Export workflow to `workflows/bulletin_synthesis.json`.
  - [ ] Commit file.

## Dev Notes

### Architecture Constraints

- **Background Processing:** Next.js must NOT generate the bulletin. Next.js only reads the `Bulletin` table. n8n orchestrates Ollama and writes to the DB. (AD-9, AD-11).
- **Ollama Constraints:** Ensure the node points to `http://ollama:11434` (Docker network name). Ensure it uses the dynamic model name (from env if n8n supports it, or document the exact string if hardcoded).

### AI Invariant Enforcement

The prompt *MUST* contain the 4 rules from the `AGENTS.md` invariants. If the generated text contains advice like "Bà con nên bán lúa ngay", the prompt needs refinement.

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `workflows/bulletin_synthesis.json`

**Files to UPDATE:**
- N/A
