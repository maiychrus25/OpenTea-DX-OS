# Story 2.5: Market Expert Chatbot (Manager/Farmer)

Status: ready-for-dev

## Story

As a Manager or Farmer,
I want to ask a chatbot questions about market trends, crop prices, and weather forecasts,
so that I can get immediate answers based on the real-time data collected by the HTX.

## Dependencies
- **Depends on:** 2.4
- **Blocks:** 2.6

## Acceptance Criteria

1. **Given** I am logged in as a Manager or Farmer **When** I click the Chatbot icon (e.g., floating action button or sidebar link) **Then** a chat window opens.
2. **Given** the chat window **When** I type a question like "Giá lúa hôm nay bao nhiêu?" **Then** the message is sent to `/api/chat`.
3. **Given** the `/api/chat` endpoint **When** it receives a request **Then** it queries the database (`MarketData`, `WeatherCache`, `Bulletin`) for relevant context, constructs a prompt, and streams the response back from Ollama using the Vercel AI SDK (`ai` package).
4. **Given** the chat response **When** it is displayed **Then** it includes source citations (e.g., "Theo World Bank...") and strictly follows the AI Invariants (No recommendations).
5. **Given** a completed chat turn **When** it finishes **Then** the entire conversation is saved to the `ChatHistory` table for audit/context retention.
6. **Given** the chat UI **When** a response is streaming **Then** the UI updates in real-time and automatically scrolls to the bottom.

## Tasks / Subtasks

- [ ] **T1: RAG Context Retrieval (Use Case)** (AC: 3)
  - [ ] Create `src/application/useCases/RetrieveMarketContextUseCase.ts`.
  - [ ] Implement logic: based on the user's query (simple keyword matching for MVP, e.g., "gạo", "thời tiết"), fetch the latest 5 `MarketData` rows, the latest `Bulletin`, and current `WeatherCache`.
  - [ ] Format this data into a dense text block.

- [ ] **T2: Setup Vercel AI SDK & Ollama Provider** (AC: 3)
  - [ ] Install `ai` and `@ai-sdk/ollama`.
  - [ ] Configure the Ollama provider in the API route.

- [ ] **T3: API Route Implementation** (AC: 3, 4, 5)
  - [ ] Create `src/app/api/chat/route.ts` (POST).
  - [ ] Extract the last message. Run `RetrieveMarketContextUseCase`.
  - [ ] Construct the system prompt enforcing the `AGENTS.md` Invariants (Must cite sources, No recommendations). Inject the context.
  - [ ] Call `streamText` from the AI SDK.
  - [ ] Use the `onFinish` callback in `streamText` to save the conversation (user message + AI response) to `ChatHistory` via a new `SaveChatHistoryUseCase`.

- [ ] **T4: Chat UI Component** (AC: 1, 2, 6)
  - [ ] Create `src/components/features/chat/ChatWindow.tsx` (Client Component).
  - [ ] Use the `useChat` hook from the `ai/react` package to handle state and streaming automatically.
  - [ ] Style the messages using design tokens. Add a typing indicator/spinner while waiting for the first byte.

- [ ] **T5: Role Integration** (AC: 1)
  - [ ] Add the Chat window to the `AppShell` (or specific layouts) as a floating button or accessible via the navigation menu for Managers and Farmers.

- [ ] **T6: Validate & Commit**
  - [ ] Ensure `npx tsc --noEmit` passes.
  - [ ] Verify streaming works without Next.js timeout errors.
  - [ ] Commit: `feat(chat): implement market expert chatbot with vercel ai sdk and ollama`

## Dev Notes

### Architecture Constraints

- **Streaming:** The AI SDK requires the Route Handler to return a `StreamingTextResponse` (or equivalent in newer SDK versions). Ensure the route is compatible with Next.js edge runtime or node streaming.
- **RAG for MVP:** For the Proof of Concept, we are NOT building a vector database (like pgvector or Pinecone). We are doing "Poor Man's RAG": simple keyword extraction from the prompt to fetch recent SQL records and shoving them into the context window. Keep it simple.
- **AI Invariants:** The system prompt is the most critical part of this story.

### Example System Prompt

```text
Bạn là trợ lý ảo thị trường nông sản của HTX.
Quy tắc BẮT BUỘC (Nếu vi phạm, hệ thống sẽ sập):
1. CHỈ trả lời dựa trên "Dữ Liệu Ngữ Cảnh" được cung cấp. Nếu dữ liệu không có, nói "Tôi chưa có thông tin này".
2. LUÔN LUÔN trích dẫn nguồn khi đưa ra số liệu (vd: Theo nguồn World Bank...).
3. TUYỆT ĐỐI KHÔNG đưa ra lời khuyên, khuyến nghị hành động (vd: Cấm nói "Bà con nên bán", "Nên chờ giá lên"). Chỉ cung cấp thông tin khách quan.
4. KHÔNG tự ý đưa ra quyết định thay HTX.

[Dữ Liệu Ngữ Cảnh]
{context_string}
```

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/src/application/useCases/RetrieveMarketContextUseCase.ts`
- `apps/web/src/application/useCases/SaveChatHistoryUseCase.ts`
- `apps/web/src/app/api/chat/route.ts`
- `apps/web/src/components/features/chat/ChatWindow.tsx`
- `apps/web/src/components/features/chat/ChatWindow.module.css`

**Files to UPDATE:**
- `apps/web/package.json` (Add `ai`, `@ai-sdk/ollama`)
- `apps/web/src/components/layout/AppShell/AppShell.tsx` (Add chat toggle/fab)
