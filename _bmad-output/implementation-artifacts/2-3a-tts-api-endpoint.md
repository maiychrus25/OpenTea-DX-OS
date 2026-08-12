# Story 2.3a: TTS API Route & Piper Adapter

Status: ready-for-dev

## Story

As a developer (enabling TTS across Bulletin, Notifications, and Farmer Dashboard),
I want a `POST /api/tts` endpoint that synthesizes Vietnamese text to audio via the Piper service,
so that all three TTS use cases (Stories 2.3, 2.7, 5.1) share a single reliable backend adapter.

## Acceptance Criteria

1. **Given** authenticated user calls `POST /api/tts` with `{ text: string }` (max 500 chars) → returns `audio/wav` stream
2. `GET /api/tts/status` → `{ available: boolean }` — used by FE to conditionally show/hide TTS buttons
3. Piper service unavailable → HTTP 503 `{ error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ đọc văn bản tạm ngưng.' } }`
4. Empty text or text > 500 chars → HTTP 400 with validation error
5. Unauthenticated request → HTTP 401
6. Hexagonal pattern: Zod validate → `PiperTtsAdapter` (infrastructure) → return stream

## Tasks / Subtasks

- [ ] Create `apps/web/src/app/api/tts/route.ts` (AC: 1, 3, 4, 5, 6)
  - [ ] POST handler: auth check → Zod validate → PiperTtsAdapter → return wav stream
  - [ ] On Piper error: catch and return 503 response
- [ ] Create `apps/web/src/app/api/tts/status/route.ts` (AC: 2)
  - [ ] GET handler: `PiperTtsAdapter.checkHealth()` → return `{ available: bool }`
- [ ] Create `apps/web/src/domain/shared/ports/TtsPort.ts` (AC: 6)
  - [ ] `interface TtsPort { synthesize(text: string): Promise<ReadableStream>; checkHealth(): Promise<boolean> }`
- [ ] Create `apps/web/src/infrastructure/tts/PiperTtsAdapter.ts` (AC: 3, 6)
  - [ ] Connect to `http://piper:10200` (Docker internal hostname)
  - [ ] POST text → receive WAV audio
  - [ ] Implement `checkHealth()` with timeout
- [ ] Create `apps/web/src/lib/validations/tts.schema.ts` (AC: 4)
  - [ ] Zod: `{ text: z.string().min(1).max(500) }`

## Dev Notes

### Piper TTS Protocol
Piper serves via Wyoming protocol on port 10200 but also supports simple HTTP:
```
POST http://piper:10200/api/tts
Content-Type: text/plain
Body: <text to synthesize>
Response: audio/wav binary
```
Verify Piper's actual HTTP API in docker-compose (service: `piper`, image).

### Streaming Response Pattern
```typescript
// Return audio stream from Next.js route:
const piperResponse = await fetch('http://piper:10200/api/tts', {
  method: 'POST',
  body: text,
  headers: { 'Content-Type': 'text/plain' },
  signal: AbortSignal.timeout(30000), // 30s timeout
})
if (!piperResponse.ok) throw new Error('Piper unavailable')

return new Response(piperResponse.body, {
  headers: { 'Content-Type': 'audio/wav' },
})
```

### Infrastructure Directory
- `PiperTtsAdapter.ts` goes in `infrastructure/tts/` (new dir — follows `infrastructure/geocoding/` pattern from 2.0a)

### References
- [Source: docker/docker-compose.yml — Piper service configuration and port]
- [Source: apps/web/src/auth.ts — auth() function]
- [Source: apps/web/src/domain/shared/ports/ — port interface pattern from Story 2.0a]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/api/tts/route.ts` (NEW)
- `apps/web/src/app/api/tts/status/route.ts` (NEW)
- `apps/web/src/domain/shared/ports/TtsPort.ts` (NEW)
- `apps/web/src/infrastructure/tts/PiperTtsAdapter.ts` (NEW)
- `apps/web/src/lib/validations/tts.schema.ts` (NEW)
