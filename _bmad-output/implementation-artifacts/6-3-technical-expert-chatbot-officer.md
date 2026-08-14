# Story 6.3: Technical Expert Chatbot (Officer)

Status: ready-for-dev

> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.


## Story

As a Technical Officer,
I want to chat with an AI assistant that has access to the HTX's uploaded documents (MinIO),
so that I can quickly reference standard operating procedures (SOPs) or technical manuals without reading them manually.

## Dependencies
- **Depends on:** 6.1
- **Blocks:** None

## Acceptance Criteria

1. **Given** I am an Officer **When** I navigate to `/officer/expert-chat` **Then** I see a chat interface powered by Vercel AI SDK.
2. **Given** I send a question **When** the AI processes it **Then** it uses Ollama to answer.
3. **Given** the "Poor Man's RAG" architecture (AD-9) **When** the AI is prompted **Then** the prompt includes the raw text of the most important technical document(s) injected directly into the system prompt context.
4. **Given** the AI Invariant **When** the AI replies **Then** it MUST cite its sources based on the injected document text.

## Tasks / Subtasks

- [ ] **T1: Define Domain & Service**
  - [ ] Create `src/domain/services/TechnicalDocumentService.ts`.
  - [ ] Implement logic to fetch a specific "Master Technical Manual" (or combine a few text-based files) from MinIO/DB. *Note: PDF parsing can be complex in pure TS without heavy libs, so for MVP, assume the HTX uploads a Markdown/Text version of the manual for the AI to read.*

- [ ] **T2: Vercel AI SDK Route**
  - [ ] Create `src/app/api/chat/expert/route.ts` (POST).
  - [ ] Read the incoming messages.
  - [ ] Fetch the Master Document text via `TechnicalDocumentService`.
  - [ ] Construct the system prompt: "You are a technical expert. Base your answers ONLY on the following text: [Injected Text]. Always cite the source."
  - [ ] Call Ollama via `generateText` or `streamText` from `@ai-sdk/ollama`.

- [ ] **T3: Chat UI**
  - [ ] Create `src/app/(officer)/expert-chat/page.tsx`.
  - [ ] Use `useChat({ api: '/api/chat/expert' })` from `ai`.
  - [ ] Render the chat window (can re-use styles from the Farmer chatbot in Epic 2 if abstracted).

## Dev Notes

- **"Poor Man's RAG":** Do NOT implement a vector database (Pinecone/Chroma) or embeddings. The MVP simply fetches a known text document and shoves it into the context window. Ollama models like LLaMA-3 support 8k+ context windows, which is plenty for a 10-page text manual.

## File List

**Files to CREATE:**
- `apps/web/src/domain/services/TechnicalDocumentService.ts`
- `apps/web/src/app/api/chat/expert/route.ts`
- `apps/web/src/app/(officer)/expert-chat/page.tsx`

**Files to UPDATE:**
- N/A
