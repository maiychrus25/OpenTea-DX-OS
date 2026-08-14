# Story 7.6: Login Page Refactor — 2-Panel Layout (Prototype Design)

Status: backlog

## Story

As any user navigating to `/login`,
I want the login page to display the approved 2-panel visual design from the prototype,
while continuing to authenticate through Keycloak OIDC as defined in the BA specification.

## Acceptance Criteria

1. **Layout:** `.auth-shell` grid `1fr 1fr` — bên trái `.auth-side` (dark green), bên phải `.auth-panel` (white card)
2. **Auth-side (trái):** Background `#143c2d`, Leaf icon (lime bg), tên app "DX AgriMarket", tagline, danh sách 3 tính năng nổi bật
3. **Auth-panel (phải):** Form đăng nhập với title "Đăng nhập", subtitle, button "Tiếp tục với Keycloak" → trigger `signIn('keycloak')`
4. **Mobile (≤900px):** `.auth-side` ẩn (`display: none`), chỉ hiện form panel
5. Loading state: khi user click "Tiếp tục" → button disabled + loading indicator
6. Error state: khi Keycloak unavailable → error banner hiển thị đúng
7. Không thay đổi `actions.ts` (giữ nguyên `signIn('keycloak')` logic)
8. Không có inline styles, `npm run build` passes
9. **Phụ thuộc:** Story 7-1 phải done trước (Be Vietnam Pro font cần có)

## Tasks / Subtasks

- [ ] Refactor `(auth)/login/page.tsx` (AC: 1, 2, 3)
  - Thêm `.auth-shell` wrapper (2-panel grid)
  - Tạo `.auth-side` section với branding content
  - Wrap LoginForm trong `.auth-panel`
- [ ] Refactor `(auth)/login/login-page.module.css` (AC: 1, 2, 3, 4)
  - Thay `.container` + `.card` pattern cũ → `.authShell`, `.authSide`, `.authPanel`
  - Responsive: authSide ẩn trên ≤900px
- [ ] Refactor `(auth)/login/_components/login-form.tsx` (AC: 5, 6)
  - Cập nhật text button: "Tiếp tục với Keycloak"
  - Giữ nguyên `useFormStatus` cho loading state
  - Giữ nguyên error banner

## Dev Notes

### Current State
- `page.tsx`: Hiện render `<Card>` + `<LoginForm>` centered — cần wrap trong 2-panel
- `login-page.module.css`: Có `.container` (flex center), `.card` (max-width 400px) — sẽ được thay
- `login-form.tsx`: Dùng `useFormStatus`, `useFormState` — giữ nguyên logic

### Prototype Layout Reference

```tsx
// (auth)/login/page.tsx — sau refactor
export default function LoginPage() {
  return (
    <div className={styles.authShell}>
      {/* Left panel — desktop only */}
      <aside className={styles.authSide}>
        <div className={styles.authSideBrand}>
          <span className={styles.brandIcon}><Leaf /></span>
          <strong>DX AgriMarket</strong>
        </div>
        <h1>Nền tảng nông nghiệp minh bạch</h1>
        <ul className={styles.featureList}>
          <li><CheckCircle /> Truy xuất nguồn gốc QR</li>
          <li><CheckCircle /> Nhật ký canh tác số</li>
          <li><CheckCircle /> Bản tin thị trường AI</li>
        </ul>
      </aside>
      {/* Right panel — form */}
      <main className={styles.authPanel}>
        <div className={styles.authCard}>
          <h2>Đăng nhập</h2>
          <p>Hệ điều hành số Nông nghiệp</p>
          <LoginForm />
        </div>
      </main>
    </div>
  )
}
```

### CSS Structure

```css
.authShell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.authSide {
  background: #143c2d;
  color: #fff;
  padding: 48px 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 28px;
}

.authPanel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 32px;
  background: var(--background);
}

.authCard {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: var(--radius-xl);
  padding: 36px 32px;
  box-shadow: var(--shadow-card);
}

@media (max-width: 900px) {
  .authShell { grid-template-columns: 1fr; }
  .authSide  { display: none; }
}
```

### Brand icon in authSide

```css
.brandIcon {
  width: 48px; height: 48px; background: #d6f05c; color: #143c2d;
  border-radius: 14px; display: flex; align-items: center; justify-content: center;
}
```

### DO NOT
- KHÔNG thêm multi-step form (BA spec: Keycloak redirect, không có phone/PIN steps)
- KHÔNG thay đổi `actions.ts`
- KHÔNG xóa `login-page.module.css` — chỉ cập nhật class names

### Files

- `apps/web/src/app/(auth)/login/page.tsx` (MODIFY)
- `apps/web/src/app/(auth)/login/login-page.module.css` (MODIFY)
- `apps/web/src/app/(auth)/login/_components/login-form.tsx` (MODIFY — text only)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_
