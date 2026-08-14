# Design System — DX AgriMarket

> Tài liệu này mô tả design system chính thức của DX AgriMarket.
> Mọi UI agent và developer PHẢI đọc file này trước khi tạo hoặc chỉnh sửa bất kỳ component frontend nào.
> **Nguồn gốc:** Distilled từ prototype UI đã được product owner phê duyệt.

---

## 1. Tech Stack CSS

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| CSS Framework | **Tailwind CSS v4** | Dùng `@import 'tailwindcss'` trong globals.css |
| CSS Variables | CSS Custom Properties | Design tokens trong `src/styles/globals.css` |
| Animation | `tw-animate-css` | Hiệu ứng Tailwind |
| Component library | shadcn/ui (tùy chọn) | Dùng `components.json` nếu cần |
| Inline styles | **CẤM** | Không dùng `style={{}}` |

> **Thay đổi so với rule cũ:** Dự án cho phép Tailwind CSS v4 thay vì CSS Modules thuần.
> CSS Modules vẫn được phép dùng cho animation hoặc override phức tạp.

---

## 2. Typography

| Thuộc tính | Giá trị |
|---|---|
| Font chính | **Be Vietnam Pro** (Google Fonts) |
| Subsets | `latin`, `vietnamese` |
| Weights | 400, 500, 600, 700 |
| CSS variable | `--font-be-vietnam` |
| Base font-size | 15px |
| Line-height | 1.7 (body copy) |

```tsx
// Root layout — cách import chuẩn
import { Be_Vietnam_Pro } from 'next/font/google'

const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-be-vietnam',
  weight: ['400', '500', '600', '700'],
})
```

---

## 3. Color Tokens (CSS Custom Properties)

Khai báo trong `:root` tại `src/styles/globals.css`:

```css
:root {
  /* Backgrounds */
  --background:          #f5f7f3;
  --foreground:          #19231e;
  --card:                #ffffff;

  /* Brand */
  --primary:             #176c4b;
  --primary-foreground:  #ffffff;
  --accent-lime:         #d6f05c;

  /* Neutrals */
  --secondary:           #e7f0ea;
  --muted:               #eef1ed;
  --muted-foreground:    #66736c;
  --border:              #dce3dd;

  /* Sidebar */
  --sidebar-bg:          #143c2d;
  --sidebar-darker:      #0d3023;

  /* Semantic */
  --success:             #176c4b;
  --warning:             #c98a12;
  --info:                #285d7e;
  --error:               #cc4b36;
}
```

### Pill (Badge) Colors

| Tone | Background | Text |
|---|---|---|
| `green` | `#ddf0e7` | `#176c4b` |
| `amber` | `#fff0cc` | `#865b00` |
| `blue` | `#e0ecf5` | `#285d7e` |
| `neutral` | `#edf0ed` | `#657069` |

---

## 4. Border Radius Scale

```css
--radius-sm:   0.5rem;
--radius-md:   0.75rem;
--radius-lg:   1rem;
--radius-xl:   1.25rem;
```

---

## 5. Layout Architecture

### App Shell (Authenticated)

```
+----------------------------------------------------------+
| SIDEBAR (276px fixed)  |  WORKSPACE                     |
| .sidebar               |  +------------------------+    |
|  +-- .brand (78px)     |  | TOPBAR (70px sticky)   |    |
|  +-- .coop             |  +------------------------+    |
|  +-- nav               |  CONTENT (.content)            |
|  +-- .sidebar-foot     |   padding: 28px 32px 80px      |
|                        |   max-width: 1500px             |
+----------------------------------------------------------+
```

**Mobile (<=800px):** Sidebar trở thành overlay drawer, bottom nav bar xuất hiện với 4 items.

### Content Grid Patterns

```
dashboard-grid   => grid-template-columns: 1.2fr 0.8fr
metric-grid      => grid-template-columns: repeat(4, 1fr)
map-layout       => grid-template-columns: minmax(0,1fr) 310px
chat-layout      => grid-template-columns: 250px 1fr
qr-preview-grid  => grid-template-columns: 1fr 220px
```

### Public Pages (Unauthenticated)

Dùng `.trace-shell` layout: `max-width: 640px; margin: 0 auto; padding: 28px 20px 60px;`
Ap dung cho: `/lot/[lot_code]` va `/htx/[slug]`.

---

## 6. Core Component Patterns

### 6.1 Pill (Badge)

```tsx
<span className="pill pill-green">Dang cham soc</span>
<span className="pill pill-amber">Cho duyet</span>
<span className="pill pill-blue">Da xuat QR</span>
<span className="pill pill-neutral">Noi bo</span>
```

CSS: `display: inline-flex; align-items: center; padding: 5px 9px; border-radius: 999px; font-size: 9px; font-weight: 700;`

### 6.2 Buttons

```tsx
<button className="primary-button">   {/* Filled green, min-height 42px */}
<button className="secondary-button"> {/* Outlined, white bg */}
<button className="text-button">      {/* Ghost, green text */}
<button className="icon-button">      {/* 40x40, bordered */}
```

### 6.3 Surface (Card)

```tsx
<section className="surface">
  <div className="section-head">
    <div>
      <span className="eyebrow">NHAN CATEGORY</span>
      <h2>Tieu de section</h2>
    </div>
    <button className="text-button">Xem tat ca</button>
  </div>
</section>
```

CSS: `padding: 22px; border: 1px solid var(--border); border-radius: 14px; background: #fff;`

### 6.4 Metric Card

```tsx
<article className="metric-card">
  <div className="metric-icon"><Icon /></div>
  <div>
    <p>Label</p>
    <strong>Value</strong>
    <span>Detail</span>
  </div>
</article>
```

### 6.5 Form Grid

```tsx
<div className="form-grid">
  <label>Ten truong<input /></label>
  <label className="full-field">Ghi chu<textarea /></label>
</div>
<div className="form-actions">
  <button className="secondary-button">Huy</button>
  <button className="primary-button">Luu</button>
</div>
```

### 6.6 Eyebrow Text

```tsx
<span className="eyebrow">NHAT KY CANH TAC</span>
```

CSS: `font-size: 10px; font-weight: 700; letter-spacing: 0.11em; color: #60806d;`

### 6.7 AI Disclaimer Note (MANDATORY khi hien thi AI output)

```tsx
<p className="ai-note">
  <Bot />
  AI tong hop du lieu, khong dua ra khuyen nghi san xuat.
</p>
```

### 6.8 Source Box (Citation — MANDATORY khi hien thi du lieu thi truong)

```tsx
<div className="source-box">
  <FileCheck2 />
  <div>
    <strong>3 nguon da kiem chung</strong>
    <span>VietGAP · So NN&PTNT · Cho dau moi</span>
  </div>
</div>
```

---

## 7. Authentication UI Pattern

**Route:** `/(auth)/login` — Component: `LoginView`

**Flow 4 buoc:** `phone -> method -> pin | passkey`

Layout: `.auth-shell` = `grid-template-columns: 1fr 1fr`
- Trai: `.auth-side` (dark green background, marketing copy)
- Phai: `.auth-panel` (form card)

**Mobile (<=900px):** `.auth-side` an, chi hien thi form.

---

## 8. Sidebar Navigation

```tsx
<aside className="sidebar">
  <div className="brand">  {/* Logo + ten app */}
  <div className="coop">   {/* Ten HTX */}
  <nav>                    {/* Menu items theo role */}
  <div className="sidebar-foot">
    <div className="role-switch">  {/* DEV ONLY */}
    <button className="profile">   {/* User avatar */}
  </div>
</aside>
```

Active state: `box-shadow: inset 3px 0 #d6f05c;` (lime left border)

---

## 9. Map UI Pattern

**Bat buoc:** `'use client'` + `dynamic(ssr: false)` cho Leaflet component.

```tsx
const FarmMap = dynamic(() => import('./_components/FarmMap'), { ssr: false })
```

---

## 10. Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| `> 1100px` | Full desktop layout |
| `<= 1100px` | metric-grid 2 cols, map detail panel an |
| `<= 800px` | Sidebar drawer, bottom nav hien, global search an |
| `<= 430px` | metric-grid 1 col |
| `<= 900px` | Auth side panel an |

---

## 11. Icon Library

Dung **Lucide React** (`lucide-react`). Global SVG reset: `width: 20px; height: 20px; stroke-width: 1.8;`

Cac icon dac trung:
- `<Leaf />` — Brand/logo
- `<Sprout />` — Vung canh tac
- `<PackageCheck />` — Lo hang
- `<FileCheck2 />` — Nhat ky / chung nhan
- `<Stethoscope />` — Chan doan benh
- `<QrCode />` — Xuat QR
- `<Bot />` — AI disclaimer
- `<Fingerprint />` — Passkey auth

---

## 12. Page Structure Convention

```tsx
export default async function FeaturePage() {
  return (
    <div className="page-stack">
      <section className="page-title">
        <div>
          <span className="eyebrow">CATEGORY LABEL</span>
          <h1>Page Title</h1>
          <p>Mo ta ngan...</p>
        </div>
        <button className="primary-button">Action</button>
      </section>
      {/* Feature content */}
    </div>
  )
}
```

---

## 13. Public Pages

### `/lot/[lot_code]` — QR Truy xuat

Layout `.trace-shell`. Thu tu hien thi:
1. Thong tin san pham & lo hang
2. Nguon goc (HTX, ho, thua, nguoi duyet)
3. Nhat ky canh tac & an toan (timeline + withdrawal check)
4. Chung nhan (PDF links tu MinIO pre-signed)

> **MANDATORY:** Disclaimer cuoi trang — "DX AgriMarket khong chinh sua hoac xac nhan thay cho can bo ky thuat."

### `/htx/[slug]` — HTX Storefront

Trang nang luc cong khai: stats HTX + danh sach lo hang san sang giao thuong.

---

## 14. Design Principles

1. **Du lieu luon co nguon** — Moi so lieu thi truong/AI deu kem `source-box` hoac `source-line`.
2. **AI khong quyet dinh** — Luon co `ai-note` disclaimer khi hien thi AI output.
3. **Role-based clarity** — UI khac nhau ro rang giua manager/officer/farmer.
4. **Mobile-first** — Bottom nav va drawer sidebar cho mobile.
5. **Trang thai tuong minh** — Moi entity (thua, lo, nhat ky) deu co Pill status.
