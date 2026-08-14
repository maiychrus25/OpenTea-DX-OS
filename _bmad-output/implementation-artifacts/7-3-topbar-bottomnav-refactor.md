# Story 7.3: TopBar & BottomNav Refactor — Prototype Design

Status: backlog

## Story

As a developer,
I want the TopBar and BottomNav components refactored to match the prototype design,
so that the app shell is visually complete with search, menu button (mobile), and correct mobile bottom navigation.

## Acceptance Criteria

1. **TopBar — Desktop:** Height `70px`, sticky, `background: #fff`, `border-bottom: 1px solid var(--border)`. Chứa: hamburger button (ẩn trên desktop, hiện trên mobile), page title area, global search input (hiện trên desktop ≥800px), notification bell placeholder, user avatar button
2. **TopBar — Mobile (≤800px):** Hamburger button hiện. Search input ẩn. Chỉ còn: hamburger + page title + bell icon
3. **BottomNav — Mobile only (≤800px):** Xuất hiện fixed bottom, chứa 4 items đầu của `navItems`. Active item: `color: var(--primary)`. Ẩn trên desktop
4. TopBar nhận prop `onMenuOpen: () => void` để trigger sidebar drawer từ story 7-2
5. Không có inline styles trong bất kỳ component nào
6. `npm run build` passes

## Tasks / Subtasks

- [ ] Refactor `TopBar.tsx` (AC: 1, 2, 4, 5)
  - Thêm prop `onMenuOpen: () => void`
  - Thêm hamburger `<Menu />` button (`data-testid="menu-button"`)
  - Thêm global search `<input>` (CSS: ẩn trên mobile)
  - Giữ placeholder cho notification bell (story 7-6 sẽ implement)
  - Giữ placeholder cho user avatar
- [ ] Update `TopBar.module.css` (AC: 1, 2)
  - Height 70px, sticky, border-bottom
  - Responsive: search ẩn tại ≤800px, hamburger hiện tại ≤800px
- [ ] Refactor `BottomNav.tsx` (AC: 3, 5)
  - Chỉ hiển thị 4 items đầu
  - Active state dùng `usePathname()`
  - `data-testid="bottom-nav"`
- [ ] Update `BottomNav.module.css` (AC: 3)
  - Fixed bottom, z-index cao hơn content
  - Ẩn trên desktop, hiện trên ≤800px
- [ ] Cập nhật `AppShell.tsx` để pass `onMenuOpen` vào TopBar (AC: 4)

## Dev Notes

### Current State
- `TopBar.tsx`: Hiện render role name và user name — đơn giản
- `BottomNav.tsx`: Render nav items dạng bottom bar — cần style lại

### Prototype TopBar structure

```tsx
<header className="topbar">
  <button className="icon-button menu-btn" onClick={onMenuOpen} data-testid="menu-button">
    <Menu />
  </button>
  <div className="search-wrap"> {/* ẩn trên mobile */}
    <Search />
    <input placeholder="Tìm kiếm..." />
  </div>
  <div className="topbar-actions">
    {/* NotificationBell placeholder — story 7-6 */}
    <button className="icon-button" aria-label="Thông báo"><Bell /></button>
    {/* User avatar placeholder */}
    <button className="icon-button avatar-btn">NM</button>
  </div>
</header>
```

### Prototype BottomNav structure

```tsx
<nav className="bottom-nav" data-testid="bottom-nav">
  {navItems.slice(0, 4).map(item => (
    <button className={active ? 'active' : ''}>
      <item.icon />
      <span>{item.label}</span>
    </button>
  ))}
</nav>
```

### CSS values

```css
/* TopBar */
.topbar { height: 70px; position: sticky; top: 0; background: #fff; border-bottom: 1px solid var(--border); }
.menu-btn { display: none; } /* desktop */
@media (max-width: 800px) {
  .search-wrap { display: none; }
  .menu-btn { display: flex; }
}

/* BottomNav */
.bottom-nav { display: none; } /* desktop */
@media (max-width: 800px) {
  .bottom-nav { display: flex; position: fixed; bottom: 0; background: #fff; border-top: 1px solid var(--border); }
}
.bottom-nav button.active { color: var(--primary); }
```

### Files

- `apps/web/src/components/layout/TopBar/TopBar.tsx` (MODIFY)
- `apps/web/src/components/layout/TopBar/TopBar.module.css` (MODIFY hoặc tạo nếu chưa có)
- `apps/web/src/components/layout/BottomNav/BottomNav.tsx` (MODIFY)
- `apps/web/src/components/layout/BottomNav/BottomNav.module.css` (MODIFY hoặc tạo)
- `apps/web/src/components/layout/AppShell/AppShell.tsx` (MODIFY — pass onMenuOpen)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `apps/web/src/components/layout/TopBar/TopBar.tsx` (MODIFY)
- `apps/web/src/components/layout/BottomNav/BottomNav.tsx` (MODIFY)
- `apps/web/src/components/layout/AppShell/AppShell.tsx` (MODIFY)
