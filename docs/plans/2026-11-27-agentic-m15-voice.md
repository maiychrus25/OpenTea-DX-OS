<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M15: voice messages — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a person sends a Telegram voice message of at most 60 seconds.
- The cooperative's own server turns it into text with whisper.cpp. The audio never leaves the server, and it is deleted at once.
- The bot answers `Em nghe được: “…”` with the buttons `Đúng`, `Sửa` and `Huỷ`.
- Only `Đúng` sends the text on, as if it were typed, so any write still needs its confirmation card.
- Done when a farmer says "ghi nhật ký bón phân thửa A3", presses `Đúng`, and the journal flow starts with the parcel and the activity filled. Tests 40 and 41.

**Architecture:**
- **New optional service `dxos-stt`** (in the `voice` group with Piper): the whisper.cpp HTTP server. It converts audio with its own ffmpeg, and its model is downloaded once into a volume by `stt-init`, like `ollama-init`.
- **The relay** downloads the voice file into memory, posts it to `dxos-stt` on the internal network, drops the bytes, and forwards only `voice_text` and `voice_duration` to the web.
- **The web** answers with the M5 engine: a new conversation kind `voice` holds the text for 10 minutes, and `Đúng` replays it through `onText`.

**Tech Stack:** whisper.cpp server image (pinned tag, MIT), Whisper ggml model weights (MIT), Python 3.12 standard library (`platform/telegram`), Next.js 14 (`apps/web`).

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` §13.5 (voice), D16 and issue #59, §8.4 (local models and licences), §15 tests 40 and 41, milestone row M15.

## Global Constraints

- **Dependencies.** The STT image and the model are new dependencies.
  - Pin the image by a tag at least two weeks old.
  - Record both, with their licences, in `DEPENDENCIES.md`.
  - The model defaults to `small` (multilingual) through `DXOS_STT_MODEL`. The choice of the smallest model that understands the pilot cooperative's recordings is a measurement step (C5), done with the owner's recordings.
- **Audio stays local.**
  - It is held in memory only and never written to disk by the relay.
  - It is posted only to `DXOS_STT_URL`, which must resolve to a host on the compose network (the relay refuses any URL whose host is not `dxos-stt`, `localhost` or a private address).
  - It is dropped right after the answer (test 41).
- **Voice never acts.** A voice message never runs anything. Only `Đúng` passes the text on, and writes still need their card (test 40).
- **When `dxos-stt` is not running,** a voice message gets `Chưa nghe được tin thoại lúc này. Bạn nhắn chữ giúp nhé.`. Nothing breaks.

## Review Focus

1. **A voice message over 60 seconds** is refused without downloading: `Tin thoại dài quá 60 giây. Bạn nói ngắn hơn hoặc nhắn chữ nhé.`.
2. **An STT timeout or error**: the fallback text above, no retry loop, and the bytes are still dropped.
3. **An old `Đúng` button.** Pressing `Đúng` after 10 minutes, or after another flow started, answers `staleButton` and sends nothing.
4. **Empty or noise-only transcription** answers `Chưa nghe rõ. Bạn nói lại hoặc nhắn chữ nhé.` with no buttons.
5. **A voice message in a group or from an unlinked user**: groups are ignored, and an unlinked user gets the M2 reply. Nothing is downloaded.

---

## Contracts

### C1. Compose

- **`dxos-stt`:**
  - image `ghcr.io/ggml-org/whisper.cpp:<pinned server tag>`;
  - command `whisper-server --host 0.0.0.0 --port 8080 -m /models/ggml-${DXOS_STT_MODEL:-small}.bin -l vi --convert`;
  - volume `stt_models:/models:ro`;
  - `mem_limit: 2g`, no published port;
  - network `agrimarket-net`;
  - in `EXTRAS_VOICE`.
- **`stt-init`** (profile `tools`): downloads the model file from the pinned Hugging Face URL (`ggerganov/whisper.cpp`, file `ggml-<model>.bin`) into `stt_models`, and checks its sha256 against a value in the compose file.
- **`make up-voice`** runs `stt-init` first when the model file is missing.

### C2. Relay (`platform/telegram`)

- **`message.voice`** `{file_id, duration, mime_type}`:
  - when `duration > 60` → forward `voice_error: 'too_long'`;
  - otherwise `getFile` → download into memory (at most 2 MB, else `too_long`) → `POST {DXOS_STT_URL}/inference` as multipart (`file`, `response_format=json`, `language=vi`, timeout 30 s) → forward `voice_text` (trimmed, at most 500 characters) and `voice_duration`;
  - an STT failure forwards `voice_error: 'stt_unavailable'`.
- `DXOS_STT_URL` defaults to `http://dxos-stt:8080`, and the host check is as in the Global Constraints.
- Tests:
  - the download, multipart and drop path with a fake STT;
  - too long;
  - STT down;
  - a public `DXOS_STT_URL` is refused at start;
  - test 41: in the test harness, nothing but the STT host receives audio bytes.

### C3. Web (M5 engine)

- `TelegramMessageInput` gains `voice_text`, `voice_duration` and `voice_error`.
- **Engine:**
  - a voice text → set a conversation `kind: 'voice'`, state `{text}`, 10 minutes, and reply `Em nghe được: “<text>”` with `Đúng` (v2 `s=vok`), `Sửa` (`s=vedit`) and `Huỷ` (`s=cancel`);
  - `Đúng` → delete the conversation, then `onText(user, text)`;
  - `Sửa` → `Bạn nhắn lại câu đúng nhé.`, and the next text is handled normally;
  - `Huỷ` → `flowCancelled`;
  - the `voice_error` values map to the C2 copy.
- **Tests:**
  - test 40: a voice text with a write intent produces no card until `Đúng`, and then the normal card, which still needs Confirm;
  - the stale `Đúng`;
  - empty text.
- **SQL:** the conversation `kind` CHECK gains `'voice'` (`09-telegram.sql` plus a migration).

### C4. Docs

- `docs/rules-and-limits.md`: the voice limits and the local-only rule.
- `README.md`: how to turn voice on (`make up-voice`).
- `DEPENDENCIES.md`: the image and the model with their licences.

### C5. Model measurement (owner data)

`make stt-measure DIR=<folder of .ogg files with .txt transcripts>` runs every file through `dxos-stt` with each of `base`, `small` and `medium`, and prints the word error rate and the time per model. The result picks `DXOS_STT_MODEL`. It needs the pilot cooperative's recordings, so the owner runs it. Until then the default is `small`.

---

## Tracks

| Track | Owns |
|---|---|
| R relay and compose | `platform/telegram/**`, `docker/docker-compose.yml` (the STT services), `Makefile` (`up-voice`, `stt-measure`), `DEPENDENCIES.md` |
| W web | `apps/web/**`, `platform/postgres/init/09-telegram.sql` |
| I smoke and docs | `platform/tests/**`, `docs/rules-and-limits.md`, `README.md` |

**The I smoke** uses the stub Bot API with a fixed OGG fixture and a stub STT service (an `http.server` answering fixed text for that fixture). The real whisper.cpp is too heavy for CI. Assertions:
- the voice answer with the three buttons;
- `Đúng` starts the journal flow with the parcel prefilled;
- test 40: no journal row before the card's Confirm;
- test 41: the stub STT is the only receiver of the bytes, which the relay test checks.
