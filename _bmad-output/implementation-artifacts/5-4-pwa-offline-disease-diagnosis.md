# Story 5.4: PWA Offline Disease Diagnosis

Status: ready-for-dev

## Story

As a Farmer,
I want the disease diagnosis feature to queue my photos when I am offline,
so that I don't lose data when working in remote fields without 4G.

## Dependencies
- **Depends on:** 5.3 (Diagnosis UI).

## Acceptance Criteria

1. **Given** the Next.js app **When** it builds **Then** it generates PWA Service Workers via `next-pwa`.
2. **Given** I am offline **When** I submit an image in `DiagnosisClient.tsx` **Then** the `fetch` is intercepted OR explicitly checked via `navigator.onLine`.
3. **Given** offline mode **When** I submit **Then** the image Blob is saved to IndexedDB (via `idb-keyval`).
4. **Given** queued images **When** connection returns (`window.ononline`) **Then** the app reads IndexedDB and silently POSTs them to `/api/diagnosis`.

## Hexagonal Architecture Design & Tasks

### 1. Frontend UI Layer (`src/`)
- [ ] **T1.1: PWA Config**
  - File: `next.config.js` (Wrap with `withPWA`).
- [ ] **T1.2: Offline Sync Hook**
  - File: `src/utils/hooks/useOfflineSync.ts`
  - Logic: Monitor `navigator.onLine`. Export `saveToQueue(blob)` and `syncQueue()`.
- [ ] **T1.3: Update UI**
  - File: `src/app/(farmer)/diagnosis/_components/DiagnosisClient.tsx`
  - Check `!isOnline`. If true, call `saveToQueue` and show "Saved offline".

## Dev Notes
- For MVP, handle offline queuing purely in React (Client side listener) rather than writing complex Service Worker Background Sync API, which has poor iOS support.
