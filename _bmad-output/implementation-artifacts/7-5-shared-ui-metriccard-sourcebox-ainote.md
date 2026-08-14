# Story 7.5: Shared UI Components — MetricCard, SourceBox, AiNote

Status: backlog

## Story

As a developer building dashboard and data pages,
I want `MetricCard`, `SourceBox`, and `AiNote` shared components available,
so that data presentation and AI safety disclaimers are consistent across all feature pages.

## Acceptance Criteria

1. **MetricCard** exists at `components/ui/MetricCard/MetricCard.tsx`, exported từ `components/ui/index.ts`
2. MetricCard nhận props: `icon: React.ReactNode`, `label: string`, `value: string | number`, `detail?: string`, `tone?: 'green' | 'amber' | 'blue' | 'neutral'`
3. **SourceBox** exists at `components/ui/SourceBox/SourceBox.tsx`, exported từ index
4. SourceBox nhận props: `count: number`, `sources: string[]`
5. **SourceBox MANDATORY rule:** Mọi component hiển thị market data (giá cả, bản tin) PHẢI render `<SourceBox />` — ghi rõ trong component JSDoc comment
6. **AiNote** exists at `components/ui/AiNote/AiNote.tsx`, exported từ index
7. AiNote nhận prop `message?: string` (default: "AI tổng hợp dữ liệu, không đưa ra khuyến nghị sản xuất.")
8. **AiNote MANDATORY rule:** Mọi component hiển thị AI output PHẢI render `<AiNote />` — ghi rõ trong JSDoc
9. Không có inline styles, `npm run build` passes

## Tasks / Subtasks

- [ ] Tạo `MetricCard.tsx` + `MetricCard.module.css` + `index.ts` (AC: 1, 2)
- [ ] Tạo `SourceBox.tsx` + `SourceBox.module.css` + `index.ts` (AC: 3, 4, 5)
- [ ] Tạo `AiNote.tsx` + `AiNote.module.css` + `index.ts` (AC: 6, 7, 8)
- [ ] Cập nhật `components/ui/index.ts` — export 3 components mới (AC: 1, 3, 6)
- [ ] Verify build (AC: 9)

## Dev Notes

### MetricCard — Structure

```tsx
// components/ui/MetricCard/MetricCard.tsx
interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  detail?: string
  tone?: 'green' | 'amber' | 'blue' | 'neutral'
}

export function MetricCard({ icon, label, value, detail, tone = 'green' }: MetricCardProps) {
  return (
    <article className={`${styles.card} ${styles[tone]}`}>
      <div className={styles.iconWrap}>{icon}</div>
      <div className={styles.content}>
        <p className={styles.label}>{label}</p>
        <strong className={styles.value}>{value}</strong>
        {detail && <span className={styles.detail}>{detail}</span>}
      </div>
    </article>
  )
}
```

### MetricCard CSS

```css
.card {
  display: flex; align-items: center; gap: 14px;
  padding: 18px 20px; border-radius: 14px; border: 1px solid var(--border);
  background: #fff;
}
.iconWrap { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.green .iconWrap  { background: #ddf0e7; color: var(--primary); }
.amber .iconWrap  { background: #fff0cc; color: #865b00; }
.blue .iconWrap   { background: #e0ecf5; color: #285d7e; }
.neutral .iconWrap{ background: #edf0ed; color: #657069; }
.label  { font-size: 12px; color: var(--muted-foreground); margin: 0; }
.value  { font-size: 22px; font-weight: 700; color: var(--foreground); }
.detail { font-size: 12px; color: var(--muted-foreground); }
```

### SourceBox — Structure

```tsx
/**
 * SourceBox — Citation component.
 * MANDATORY: Must be rendered whenever displaying market price data,
 * bulletin data, or any data sourced from external APIs (USDA, WTO, market APIs).
 * AI Invariant compliance: Every data point must have traceable sources.
 */
interface SourceBoxProps {
  count: number
  sources: string[]
}

export function SourceBox({ count, sources }: SourceBoxProps) {
  return (
    <div className={styles.sourceBox}>
      <FileCheck2 className={styles.icon} />
      <div>
        <strong>{count} nguồn đã kiểm chứng</strong>
        <span>{sources.join(' · ')}</span>
      </div>
    </div>
  )
}
```

### AiNote — Structure

```tsx
/**
 * AiNote — AI output disclaimer.
 * MANDATORY: Must be rendered whenever displaying AI-generated content,
 * chatbot responses, disease diagnosis results, or market analysis.
 * AI Invariant: AI does not make decisions for the cooperative.
 */
interface AiNoteProps {
  message?: string
}

export function AiNote({ message = 'AI tổng hợp dữ liệu, không đưa ra khuyến nghị sản xuất.' }: AiNoteProps) {
  return (
    <p className={styles.aiNote}>
      <Bot className={styles.icon} />
      {message}
    </p>
  )
}
```

### SourceBox CSS

```css
.sourceBox {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 10px;
  background: #f0f7f3; border: 1px solid #c6ddd0;
  font-size: 12px;
}
.sourceBox strong { display: block; color: var(--primary); font-weight: 700; }
.sourceBox span { color: var(--muted-foreground); }
```

### AiNote CSS

```css
.aiNote {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 14px; border-radius: 10px;
  background: #f3f8f4; border-left: 3px solid var(--primary);
  font-size: 12px; color: var(--muted-foreground); margin: 0;
}
.aiNote .icon { color: var(--primary); flex-shrink: 0; width: 16px; height: 16px; margin-top: 1px; }
```

### Files

- `apps/web/src/components/ui/MetricCard/MetricCard.tsx` (NEW)
- `apps/web/src/components/ui/MetricCard/MetricCard.module.css` (NEW)
- `apps/web/src/components/ui/MetricCard/index.ts` (NEW)
- `apps/web/src/components/ui/SourceBox/SourceBox.tsx` (NEW)
- `apps/web/src/components/ui/SourceBox/SourceBox.module.css` (NEW)
- `apps/web/src/components/ui/SourceBox/index.ts` (NEW)
- `apps/web/src/components/ui/AiNote/AiNote.tsx` (NEW)
- `apps/web/src/components/ui/AiNote/AiNote.module.css` (NEW)
- `apps/web/src/components/ui/AiNote/index.ts` (NEW)
- `apps/web/src/components/ui/index.ts` (MODIFY)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_
