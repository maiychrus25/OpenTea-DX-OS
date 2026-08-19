
# Story 8.8: Account & Profile Pages (Role-Specific Variants)

**Status:** ready-for-dev
**Epic:** 8 -- FE Prototype Reconstruction (Phase 2)
**CORRECTION:** Manager page is DIFFERENT -- combines HTX profile + personal account.

## Correct Sidebar Reference
Manager: Ho so HTX & tai khoan -> /manager/profile (2 sections: HTX profile + personal)
Officer: Tai khoan cua toi -> /officer/profile (1 section: personal only)
Farmer: Tai khoan cua toi -> /farmer/profile (1 section: personal only)

## Story
As any user, I want a profile page matching my role. Manager sees HTX stats + personal. Officer/Farmer see personal account only.

## Acceptance Criteria

### AC-1: Manager /manager/profile (Ho so HTX & tai khoan)
SECTION A -- HTX Profile:
- eyebrow: HO SO HTX
- HTX name: HTX Rau an toan Tan Phu
- Ma ho so: tp-2019, Dia chi: Xa Tan Phu, Dong Nai
- Stats grid 3-col: 24.8 ha | 42 thua | 18 ho thanh vien
- Xem trang cong khai button -> /htx/tp-2019
- Chinh sua ho so HTX button

SECTION B -- Personal Account:
- Avatar initials + name + role label (Truong HTX)
- 3 security rows (Van tay | Ma PIN | Thiet bi)
- Logout button (red)

### AC-2: Officer /officer/profile (Tai khoan cua toi)
- Avatar + name + role (Can bo KT/CL)
- 3 security rows
- Logout

### AC-3: Farmer /farmer/profile (Tai khoan cua toi)
- Avatar + name + role (Nong dan)
- Security rows (simplified)
- Logout

### AC-4: Security Rows (.security-row) -- All roles
- Van tay / FaceID | Dang su dung (green badge)
- Ma PIN 6 so | Doi PIN button
- Thiet bi dang nhap | Quan ly button

### AC-5: Logout = router.push to /login (NOT GET with token)

### AC-6: Avatar Guard -- empty name shows U, no crash

### AC-7: License Header + No Inline Styles

## Tasks
- [ ] Create (manager)/profile/page.tsx [NEW] -- 2 sections
- [ ] Create (officer)/profile/page.tsx [NEW] -- 1 section
- [ ] Create (farmer)/profile/page.tsx [NEW] -- 1 section
- [ ] Shared AccountSection component (security rows + logout)
- [ ] npm run build passes

## Scope Boundary

This is FE prototype work only. Save, logout/session invalidation, PIN/passkey changes, avatar/phone/preferences and HTX profile persistence require the profile/auth integration stories.

## Dev Notes


### 🚀 KHAI THÁC TỪ PROTOTYPE (D:\FE)
- **JSX/Mock data**: Copy trực tiếp function `ProfileView()` dòng 258-308 trong `D:\FE\components\agri-app.tsx`. 
- **Tách Role**: Extract phần JSX của Manager / Officer / Farmer vào các route tương ứng (thay vì dùng if else như FE mẫu).
- **CSS**: Copy các class `.security-row`, `.logout-link`, `.metric-grid.three` từ `D:\FE\app\globals.css`.
- **Rule Check**: Không dùng thẻ `<Link>` cho việc Đăng xuất vì liên quan đến clear token/session. Phải dùng action Server-side hoặc onClick client.
