# Story 2.3: Bulletin TTS "Listen" Button (Piper Integration)

Status: ready-for-dev

## Story

As a Farmer or Officer,
I want to click a "Listen" button on the bulletin page,
so that I can hear the market summary read aloud in Vietnamese without having to read the text.

## Dependencies
- **Depends on:** 2.2
- **Blocks:** 2.4

## Acceptance Criteria

1. **Given** the Bulletin View (Story 2.2) **When** a bulletin is displayed **Then** a "Nghe bản tin" (Listen) button is visible near the title.
2. **Given** the Listen button **When** clicked for the first time **Then** it triggers a request to `/api/tts?bulletinId=123`.
3. **Given** the `/api/tts` endpoint **When** called **Then** it fetches the bulletin text, strips markdown formatting to plain text, sends it to the local Piper TTS service, and streams the audio response back to the client.
4. **Given** the audio stream **When** it starts playing **Then** the "Listen" button changes to a "Pause" or "Stop" button, and a simple audio progress indicator (or standard HTML5 `<audio>` player) is shown.
5. **Given** the Piper TTS service **When** text is sent **Then** the voice used is `vi_VN-vais1000-medium` (as configured in the docker-compose stack).

## Tasks / Subtasks

- [ ] **T1: Create TTS API Route** (AC: 3, 5)
  - [ ] Create `src/app/api/tts/route.ts`.
  - [ ] Implement `GET` handler accepting `bulletinId`.
  - [ ] Fetch the bulletin from the database. If not found, return 404.
  - [ ] Strip Markdown: Use a simple regex or a lightweight library (e.g., `remove-markdown`) to convert `## Tiêu đề` to `Tiêu đề`.
  - [ ] **Piper Integration:** Piper in Docker uses the Wyoming protocol (port 10200) by default, NOT HTTP.
    - *Option A (Recommended for MVP):* Use a small Python/Node script to bridge Wyoming to HTTP, or execute the `piper` CLI directly inside a container if HTTP wrapper is too complex.
    - *Option B (Alternative):* If the Docker image `rhasspy/wyoming-piper` has an HTTP server mode, configure `docker-compose.yml` to expose it and make a standard HTTP POST request. Assuming Option B or a bridge is configured: send the stripped text to the Piper HTTP endpoint and return the `audio/wav` stream as the Next.js response.

- [ ] **T2: Audio Player Component** (AC: 1, 2, 4)
  - [ ] Create `src/components/features/bulletin/AudioPlayer.tsx`.
  - [ ] Implement state: `isPlaying`, `isLoading`.
  - [ ] Use native HTML5 `<audio>` element (can be hidden if building custom UI, or just use the native `controls` for simplicity).
  - [ ] Provide a `<Button variant="secondary" icon={...}>` (from Epic 7, Story 7-4) to toggle playback.
  - [ ] Set `src` to `/api/tts?bulletinId=${bulletin.id}`. (Do NOT pre-fetch audio on page load to save resources; only set `src` or call `play()` when the user clicks).

- [ ] **T3: Integrate with BulletinView** (AC: 1)
  - [ ] Update `src/components/features/bulletin/BulletinView.tsx` to include the `<AudioPlayer>` component.

- [ ] **T4: Validate & Commit**
  - [ ] Ensure Piper container is running and responding.
  - [ ] Test with Vietnamese text containing accents.
  - [ ] Commit: `feat(market): add tts audio player to bulletin using piper`

## Dev Notes

### Architecture Constraints

- **Streaming:** The `/api/tts` route should ideally stream the response chunk-by-chunk rather than waiting for the entire audio file to generate, minimizing Time To First Byte (TTFB). Next.js supports streaming responses.
- **Wyoming Protocol Gotcha:** As noted in Story 1.1, the standard Piper docker image uses the Wyoming protocol. If you cannot easily communicate via Wyoming from Node.js, update `docker-compose.yml` to use a different Piper wrapper image that provides a simple HTTP API (e.g., a FastAPI wrapper around Piper CLI), or use `child_process.exec` to run the Piper CLI directly if it's installed in the Next.js container (not recommended for production, but okay for local dev if necessary).

*Recommendation for Dev Agent:* Investigate the easiest way to get an HTTP stream from the Piper container. If an HTTP wrapper is needed, add a small Python FastAPI service to the monorepo just for TTS proxying.

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/src/app/api/tts/route.ts`
- `apps/web/src/components/features/bulletin/AudioPlayer.tsx`
- `apps/web/src/components/features/bulletin/AudioPlayer.module.css`

**Files to UPDATE:**
- `apps/web/src/components/features/bulletin/BulletinView.tsx`
- `apps/web/package.json` (Add `remove-markdown` or similar)
