# Story 7.4: Shared UI Components — Pill, Button Variants

Status: backlog

## Story

As a developer building feature pages,
I want `Pill` (badge) and enhanced `Button` components available with the correct prototype variants,
so that status indicators and call-to-action elements across all feature pages look consistent.

## Acceptance Criteria

1. **Pill component** exists at `components/ui/Pill/Pill.tsx` và được export từ `components/ui/index.ts`
2. Pill nhận prop `tone: 'green' | 'amber' | 'blue' | 'neutral'` và render đúng màu sắc theo DESIGN.md
3. Pill nhận prop `size?: 'sm' | 'md'` (default `'sm'`)
4. **Button component** hiện tại được bổ sung variants: `'primary' | 'secondary' | 'text' | 'icon'`
5. `variant="primary"`: `background: var(--primary)`, white text, `min-height: 42px`, border-radius `var(--radius-md)`
6. `variant="secondary"`: `border: 1px solid var(--border)`, white background, `color: var(--foreground)`
7. `variant="text"`: no border/background, `color: var(--primary)`, hover underline
8. `variant="icon"`: `40×40px`, `border: 1px solid var(--border)`, border-radius `var(--radius-sm)`
9. Existing usages của `Button` trong `login-form.tsx` tiếp tục hoạt động (backward-compat)
10. Không có inline styles, `npm run build` passes

## Tasks / Subtasks

- [ ] Tạo `components/ui/Pill/Pill.tsx` (AC: 1, 2, 3)
  - Props: `tone`, `size`, `children`, `className?`
  - Xem Dev Notes cho màu sắc chính xác
- [ ] Tạo `components/ui/Pill/Pill.module.css` (AC: 2, 3)
- [ ] Tạo `components/ui/Pill/index.ts`
- [ ] Cập nhật `components/ui/index.ts` — export Pill (AC: 1)
- [ ] Refactor `components/ui/Button/Button.tsx` (AC: 4–8)
  - Thêm `variant` prop (default: `'primary'` để backward-compat)
  - Cập nhật render logic theo variant
- [ ] Cập nhật `components/ui/Button/Button.module.css` (AC: 5–8)
  - Thêm class `.secondary`, `.text`, `.icon`
- [ ] Verify `login-form.tsx` không bị break (AC: 9)

## Dev Notes

### Pill — Màu sắc theo DESIGN.md

```css
/* Pill base */
.pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 9px; border-radius: 999px;
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Tones */
.green  { background: #ddf0e7; color: #176c4b; }
.amber  { background: #fff0cc; color: #865b00; }
.blue   { background: #e0ecf5; color: #285d7e; }
.neutral{ background: #edf0ed; color: #657069; }

/* Sizes */
.sm { font-size: 9px; padding: 4px 8px; }
.md { font-size: 11px; padding: 5px 10px; }
```

### Pill — Component API

```tsx
// components/ui/Pill/Pill.tsx
interface PillProps {
  tone: 'green' | 'amber' | 'blue' | 'neutral'
  size?: 'sm' | 'md'
  children: React.ReactNode
  className?: string
}

export function Pill({ tone, size = 'sm', children, className }: PillProps) {
  return (
    <span className={`${styles.pill} ${styles[tone]} ${styles[size]} ${className ?? ''}`}>
      {children}
    </span>
  )
}
```

### Button — Backward-compat

Hiện tại `login-form.tsx` dùng:
```tsx
<Button type="submit" className={styles.submitButton} isLoading={pending}>
  Đăng nhập qua Keycloak
</Button>
```
Không có `variant` prop → default phải là `'primary'` để không break.

### Button — Variant CSS

```css
/* Primary — existing style, likely already close */
.primary { background: var(--primary); color: #fff; min-height: 42px; border-radius: var(--radius-md); border: none; }
.primary:hover { background: #125c3f; }

/* Secondary */
.secondary { background: #fff; border: 1.5px solid var(--border); color: var(--foreground); min-height: 42px; border-radius: var(--radius-md); }
.secondary:hover { border-color: var(--primary); color: var(--primary); }

/* Text */
.text { background: transparent; border: none; color: var(--primary); padding: 6px 10px; font-weight: 600; }
.text:hover { text-decoration: underline; }

/* Icon */
.icon { width: 40px; height: 40px; padding: 0; display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--border); border-radius: var(--radius-sm); background: #fff; }
.icon:hover { background: var(--muted); }
```

### Files

- `apps/web/src/components/ui/Pill/Pill.tsx` (NEW)
- `apps/web/src/components/ui/Pill/Pill.module.css` (NEW)
- `apps/web/src/components/ui/Pill/index.ts` (NEW)
- `apps/web/src/components/ui/Button/Button.tsx` (MODIFY)
- `apps/web/src/components/ui/Button/Button.module.css` (MODIFY)
- `apps/web/src/components/ui/index.ts` (MODIFY)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `apps/web/src/components/ui/Pill/Pill.tsx` (NEW)
- `apps/web/src/components/ui/Pill/Pill.module.css` (NEW)
- `apps/web/src/components/ui/Pill/index.ts` (NEW)
- `apps/web/src/components/ui/Button/Button.tsx` (MODIFY)
- `apps/web/src/components/ui/Button/Button.module.css` (MODIFY)
- `apps/web/src/components/ui/index.ts` (MODIFY)
