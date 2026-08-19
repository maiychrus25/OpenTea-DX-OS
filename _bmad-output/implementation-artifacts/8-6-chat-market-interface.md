
# Story 8.6: Chat Interface -- Manager (Hoi dap Thi truong) + Officer (Tro ly Ky thuat)

**Status:** ready-for-dev
**Epic:** 8 -- FE Prototype Reconstruction (Phase 2)
**CORRECTION:** 2 separate routes, same UI shell but different bot persona per role.

## Correct Sidebar Reference
Manager sidebar item: Hoi dap thi truong -> /manager/chat
Officer sidebar item: Tro ly ky thuat -> /officer/chat
Farmer: NO chat in farmer sidebar

## Story
As a Manager or Officer, I want a chat interface (market or technical AI queries) with history sidebar, bot response with mini-chart, and source citation, so I can get sourced answers without leaving the platform.

## Acceptance Criteria

### AC-1: Two Routes, Shared ChatInterface Component
- /manager/chat: sidebar Hoi dap thi truong
- /officer/chat: sidebar Tro ly ky thuat
- ChatInterface receives role prop -> determines bot header text

### AC-2: Bot Header Varies by Role
Manager: title=Tro ly Thi truong, subtitle=Phan tich tu USDA + WTO + Cho dau moi
Officer: title=Tro ly Ky thuat, subtitle=Kien thuc canh tac + VietGAP + Benh cay

### AC-3: Layout (.chat-layout: 250px | 1fr)
- Left: .chat-history (list + New conversation button)
- Right: .chat-main (bot header + messages + composer)

### AC-4: Message Bubbles
- User: right, bg #176c4b, white, radius 14px 14px 4px 14px
- Bot: left, bg #f2f5f2, radius 4px 14px 14px 14px; includes text + mini-chart + SourceBox

### AC-5: Mini Chart (.mini-chart flex, align-items flex-end, bars color #4f9b63)

### AC-6: Composer (placeholder: Nhap cau hoi..., send icon button)

### AC-7: Mobile: .chat-history hidden at <=800px

### AC-8: Mock pre-loaded: 1 user msg + 1 bot msg with chart

### AC-9: License Header + No Inline Styles

## Tasks
- [ ] Create (manager)/chat/page.tsx [NEW]
- [ ] Create (officer)/chat/page.tsx [NEW]
- [ ] Shared ChatInterface client component (use client, useState)
- [ ] History sidebar + bubbles + chart + composer
- [ ] npm run build passes

## Scope Boundary

This is FE prototype work only. Manager market chat and Officer technical chat remain separate contracts and histories; mock submit state does not imply streaming, persistence, authorization, citations or Ollama availability handling.

## Dev Notes


### 🚀 KHAI THÁC TỪ PROTOTYPE (D:\FE)
- **JSX/Mock data**: Copy trực tiếp function `ChatView()` dòng 254 trong `D:\FE\components\agri-app.tsx`.
- **CSS**: Copy các class `.chat-layout`, `.chat-history`, `.chat-main`, `.messages`, `.user-message`, `.bot-message`, `.mini-chart`, `.composer` từ `D:\FE\app\globals.css`.
- **Rule Check**: Không lạm dụng shadcn, giữ nguyên class thuần.
