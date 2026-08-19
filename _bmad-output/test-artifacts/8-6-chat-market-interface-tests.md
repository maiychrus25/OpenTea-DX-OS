# Test Plan — Story 8.6: Chat Market Interface

**Story:** 8-6-chat-market-interface
**Test Architect:** Murat (bmad-tea)
**Risk Level:** LOW — UI-only chat, mock responses
**Test Strategy:** Component + Interaction

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Chat input SSR error (client hook) | Medium | High | Client component boundary |
| Mini chart bars not visible | Low | Low | Height check |
| Send button fires real API | N/A | N/A | Mock only - no API |
| Conversation history hidden on mobile | Medium | Low | CSS assertion |

---

## Test Cases

### T1: Chat Page Renders (Smoke)
**Given:** Navigate to /manager/chat (or equivalent route)
**Then:** .chat-layout element present, h1 = Tro ly Thi truong (in bot header)

### T2: Conversation History Sidebar
**Then:** .chat-history visible, at least 1 conversation item

### T3: Pre-loaded Bot Message
**Then:** .bot-message visible with text from mock conversation

### T4: User Message Bubble Style
**Given:** Pre-loaded user message
**Then:** .user-message has background color matching #176c4b (green)

### T5: Mini Chart in Bot Response
**Then:** .mini-chart element exists with at least 3 bar elements inside

### T6: Composer Input Accepts Text
**Then:** .composer input accepts keyboard input, value updates on type

### T7: Send Button Renders
**Then:** Send button or icon within .composer is visible and clickable

### T8: New Conversation Button
**Then:** + Cuoc tro chuyen moi button visible in sidebar header

### T9: Mobile - Sidebar Hidden
**Given:** Viewport <= 800px
**Then:** .chat-history has display:none or is not in DOM

---

## Definition of Done

- [ ] T1 Chat layout renders
- [ ] T2 History sidebar
- [ ] T3 Bot message pre-loaded
- [ ] T4 User message styling
- [ ] T5 Mini chart bars
- [ ] T6 Composer input
- [ ] T7 Send button
- [ ] T8 New conversation button
- [ ] T9 Mobile sidebar hidden
