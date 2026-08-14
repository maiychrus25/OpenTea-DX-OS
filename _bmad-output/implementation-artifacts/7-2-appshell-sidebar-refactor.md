# Story 7.2: AppShell & Sidebar Refactor — Prototype Design

Status: backlog

## Story

As a developer,
I want the AppShell and Sidebar components refactored to match the approved prototype visual design,
so that all role-based pages (manager/officer/farmer) share a consistent, professional shell.

## Acceptance Criteria

1. **Given** any authenticated role navigates to their dashboard → Sidebar hiển thị với background `#143c2d` (dark green), width `276px`
2. Sidebar có đủ 4 sections: **Brand block** (Leaf icon + "DX AgriMarket" + "Nông nghiệp minh bạch"), **Coop block** (tên HTX + địa điểm), **Nav items**, **Sidebar-foot** (role switch dev tool + user profile button)
3. Active nav item có `box-shadow: inset 3px 0 #d6f05c` (lime left indicator) và text trắng
4. Inactive nav items: text `#bfd1c6`, hover: `background: #ffffff12`
5. **Mobile (≤800px):** Sidebar ẩn bên trái (`transform: translateX(-100%)`); hamburger button xuất hiện trên TopBar; tap backdrop hoặc X button đóng sidebar
6. AppShell workspace area: `width: calc(100% - 276px); margin-left: 276px` trên desktop
7. `AppShellProps` interface giữ nguyên backward-compat: `{ children, role, userName, navItems, hideSidebar? }`
8. Không có inline styles (`style={{}}`) trong bất kỳ component nào của story này
9. `npm run build` passes sau changes
10. Existing manager layout (`manager/layout.tsx`) không cần thay đổi gì

## Tasks / Subtasks

- [ ] Refactor `AppShell.tsx` (AC: 5, 6, 7, 8)
  - Thêm state `sidebarOpen` (mobile drawer)
  - Thêm `backdrop` div khi sidebar open trên mobile
  - Wrap workspace trong `<div className="workspace">`
  - Xóa `styles.shell` CSS Module → thay bằng Tailwind/global class
- [ ] Refactor `AppShell.module.css` (AC: 6)
  - Convert layout classes sang Tailwind utility (hoặc giữ CSS Module nếu phức tạp)
  - Responsive workspace margin
- [ ] Refactor `Sidebar.tsx` (AC: 1, 2, 3, 4, 8)
  - Thêm Brand block: `<Leaf />` icon, tên app, tagline
  - Thêm Coop block: tên HTX từ props hoặc context
  - Cập nhật nav item style: active lime indicator, hover state
  - Thêm Sidebar-foot: role label + user profile button
  - Nhận prop mới: `htxName?: string`, `htxLocation?: string`, `onClose: () => void`
- [ ] Refactor `Sidebar.module.css` (AC: 2, 3, 4)
  - Thêm styles cho `.brand`, `.coop`, `.sidebarFoot`, `.roleSwitch`, `.profile`
  - Active state: `box-shadow: inset 3px 0 #d6f05c`
  - Inactive: `color: #bfd1c6`
- [ ] Cập nhật `manager/layout.tsx` nếu cần truyền htxName vào AppShell (AC: 10)
  - **OPTIONAL:** Nếu cần htxName từ DB, fetch trong layout và pass vào AppShell
- [ ] Kiểm tra build (AC: 9)

## Dev Notes

### Current State
- `AppShell.tsx`: Nhận `{ children, role, userName, navItems, hideSidebar }` — giữ nguyên interface này
- `Sidebar.tsx`: Chỉ render nav items, không có brand/coop/footer
- `AppShell.module.css`: Có `.shell`, `.content`, `.pageContent` — sẽ được cập nhật
- `Sidebar.module.css`: Có `.sidebar`, `.nav`, `.navItem`, `.active`, `.icon`, `.label`

### Prototype HTML Structure Reference (từ `D:\FE\components\agri-app.tsx`)

```tsx
// SIDEBAR structure to implement:
<aside className="sidebar open?">
  {/* Brand */}
  <div className="brand">
    <span><Leaf /></span>
    <div><strong>DX AgriMarket</strong><small>Nông nghiệp minh bạch</small></div>
    <button className="close-menu" onClick={onClose}><X /></button>
  </div>
  {/* Coop */}
  <div className="coop">
    <span>HTX</span>
    <div><strong>{htxName}</strong><small>{htxLocation}</small></div>
    <ChevronDown />
  </div>
  {/* Nav */}
  <nav>
    {navItems.map(item => (
      <button className={active ? 'active' : ''}>
        <item.icon /><span>{item.label}</span>
      </button>
    ))}
  </nav>
  {/* Footer */}
  <div className="sidebar-foot">
    <div className="role-label">ĐANG XEM VỚI VAI TRÒ</div>
    <div className="role-switch">...</div>  {/* DEV ONLY */}
    <button className="profile">
      <span>NM</span>  {/* avatar initials */}
      <div><strong>{userName}</strong><small>{roleLabel}</small></div>
    </button>
  </div>
</aside>
```

### Key CSS values to implement

```css
/* Sidebar */
--sidebar-bg: #143c2d;
width: 276px;
.brand { height: 78px; border-bottom: 1px solid #ffffff1a; }
.brand > span { background: #d6f05c; color: #143c2d; border-radius: 11px; }
.navItem.active { background: #ffffff12; color: #fff; box-shadow: inset 3px 0 #d6f05c; }
.navItem { color: #bfd1c6; }
.navItem:hover { background: #ffffff12; color: #fff; }

/* Mobile */
@media (max-width: 800px) {
  .sidebar { transform: translateX(-100%); transition: transform .2s; }
  .sidebar.open { transform: translateX(0); }
}
```

### AppShell Mobile Pattern

```tsx
// AppShell.tsx additions:
const [sidebarOpen, setSidebarOpen] = useState(false)

// Backdrop for mobile:
{sidebarOpen && (
  <button className="backdrop" onClick={() => setSidebarOpen(false)} aria-label="Đóng menu" />
)}

// Menu button in TopBar:
<button className="menu-button" onClick={() => setSidebarOpen(true)}>
  <Menu />
</button>
```

### DO NOT
- KHÔNG thay đổi `NavItem` interface (giữ `{ label, href, icon }`)
- KHÔNG xóa `BottomNav` hoặc `TopBar` (story 7-3 sẽ handle)
- KHÔNG fetch data từ DB trong Sidebar (nhận qua props từ layout)
- KHÔNG dùng inline `style={{}}`

### Files

- `apps/web/src/components/layout/AppShell/AppShell.tsx` (MODIFY)
- `apps/web/src/components/layout/AppShell/AppShell.module.css` (MODIFY)
- `apps/web/src/components/layout/Sidebar/Sidebar.tsx` (MODIFY)
- `apps/web/src/components/layout/Sidebar/Sidebar.module.css` (MODIFY)
- `apps/web/src/app/manager/layout.tsx` (MODIFY — nếu cần pass htxName)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `apps/web/src/components/layout/AppShell/AppShell.tsx` (MODIFY)
- `apps/web/src/components/layout/AppShell/AppShell.module.css` (MODIFY)
- `apps/web/src/components/layout/Sidebar/Sidebar.tsx` (MODIFY)
- `apps/web/src/components/layout/Sidebar/Sidebar.module.css` (MODIFY)
