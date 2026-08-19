# Story 8.1: Bulletin Page — 3-Card Grid & Audio Button Refactor

**Status:** ready-for-dev  
**Epic:** 8 — FE Prototype Reconstruction (Phase 2)  
**Source:** Video prototype analysis 2026-08-19

---

## Story

As a Manager/Officer (Truong HTX / Can bo ky thuat),  
I want the Ban tin nong nghiep page to display as a 3-column card grid with category labels (Thi truong / Thoi tiet / Ky thuat), an audio "Nghe ban tin sang" button in the top-right, a source count indicator per card, and an AI disclaimer footer,  
so that I can quickly scan all three types of bulletins and know each card is sourced.

---

## Acceptance Criteria

### AC-1: Page Header Layout
**Given** user navigates to `/manager/bulletin` (or `/officer/bulletin`),  
**Then** the page renders:
- `eyebrow` label: `BAN TIN NONG NGHIEP SO`
- `<h1>`: `Thong tin co nguon, de hieu`
- Subtitle: `Cap nhat thi truong, thoi tiet va ky thuat lien quan vung trong HTX.`
- Top-right CTA button: audio icon + `Nghe ban tin sang` (secondary-button style)

### AC-2: 3-Card Grid Layout
**Given** bulletins exist (mock data OK),  
**Then** cards render in a responsive 3-column grid with:
- Category pill at top: `pill-green` for "Thi truong", `pill-blue` for "Thoi tiet", `pill-amber` for "Ky thuat"
- Card `<h2>` with headline
- Body text summary ~2 lines
- Bottom row: date string + audio icon button on the right
- Source count row: checkmark icon + `N nguon da kiem chung`

### AC-3: AI Disclaimer Footer
**Given** any bulletin content is rendered,  
**Then** below the card grid, a full-width disclaimer renders:
- Robot/AI icon on the left
- Text: `Noi dung do AI tong hop tu nguon duoc duyet, khong phai khuyen nghi san xuat hoac dau tu.`
- Styled as muted footer (using `<AiNote>` component)

### AC-4: Responsive Behavior
**Given** viewport <= 1100px,  
**Then** grid collapses to 2 columns. At <= 800px -> 1 column.

### AC-5: Mock Data
**Given** backend bulletins API is not yet connected,  
**Then** page uses static mock array of 3 bulletins hardcoded in the Server Component.

### AC-6: License Header + No Inline Styles
**Then** no `style={{}}` in any new file. License header present in all new `.tsx`/`.css` files.

---

## Tasks / Subtasks

- [ ] Refactor `apps/web/src/app/(manager)/bulletin/page.tsx`
  - Replace current layout with 3-card grid structure
  - Add page header with audio "Nghe ban tin sang" button
  - Add 3 mock bulletins (Thi truong, Thoi tiet, Ky thuat)
  - Add AI disclaimer footer using `<AiNote>` component
- [ ] Create `apps/web/src/app/(manager)/bulletin/_components/BulletinCard.tsx` [NEW]
  - Props: `{ category: 'market'|'weather'|'technical', headline, summary, date, sourceCount }`
  - Render: category pill, headline, summary, date+audio row, source count row
- [ ] Update officer bulletin page if route exists
- [ ] `npm run build` must pass

---

## Scope Boundary

This is FE prototype work only. Use deterministic fixtures and preserve the bulletin API/n8n ownership for the follow-up integration story. TTS controls are visual until `/api/tts` is wired and tested.

## Dev Notes


### 🚀 KHAI THÁC TỪ PROTOTYPE (D:\FE)
- **JSX/Mock data**: Copy trực tiếp từ function `NewsView()` dòng 252 trong `D:\FE\components\agri-app.tsx`.
- **CSS**: Copy các class `.news-grid`, `.news-article`, `.article-meta` từ `D:\FE\app\globals.css` sang `src/styles/globals.css`.
- **Rule Check**: Đảm bảo không giữ lại các thẻ `style={{}}` inline, chuyển thành Tailwind hoặc biến CSS.
