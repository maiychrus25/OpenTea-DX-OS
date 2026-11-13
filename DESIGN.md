---
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
version: alpha
name: OpenTea DX-OS
description: Hệ điều hành số cho hợp tác xã chè. Giao diện sáng và tối dùng chung một bộ token; nguồn sự thật là apps/web/src/styles/globals.css.
colors:
  background: "#f5f7f3"
  background-dark: "#0b1712"
  foreground: "#19231e"
  foreground-dark: "#e3ece6"
  card: "#ffffff"
  card-dark: "#112219"
  primary: "#176c4b"
  primary-dark: "#4cc38a"
  primary-foreground: "#ffffff"
  primary-foreground-dark: "#04140c"
  accent-lime: "#d6f05c"
  accent-lime-dark: "#c9e157"
  secondary: "#e7f0ea"
  secondary-dark: "#173328"
  muted: "#eef1ed"
  muted-dark: "#162a20"
  muted-foreground: "#5d6a63"
  muted-foreground-dark: "#9fb4a8"
  border: "#dce3dd"
  border-dark: "#2a4034"
  sidebar-bg: "#143c2d"
  sidebar-bg-dark: "#0e271d"
  sidebar-darker: "#0d3023"
  sidebar-darker-dark: "#081a13"
  sidebar-foreground: "#ffffff"
  sidebar-foreground-dark: "#e8f1eb"
  primary-hover: "#125c3f"
  primary-hover-dark: "#6dd3a2"
  accent: "#b45309"
  accent-dark: "#f2b544"
  accent-hover: "#92400e"
  accent-hover-dark: "#f6c76a"
  accent-subtle: "#fef3c7"
  accent-subtle-dark: "#2e2410"
  accent-foreground: "#ffffff"
  accent-foreground-dark: "#1d1405"
  status-sowing: "#15803d"
  status-sowing-dark: "#4ade80"
  status-tending: "#a16207"
  status-tending-dark: "#facc15"
  status-harvest-approved: "#c2410c"
  status-harvest-approved-dark: "#fb923c"
  status-harvested: "#2563eb"
  status-harvested-dark: "#60a5fa"
  status-draft: "#6b7280"
  status-draft-dark: "#a3b1a9"
  success: "#15803d"
  success-dark: "#4ade80"
  warning: "#854d0e"
  warning-dark: "#fbbf24"
  danger: "#b91c1c"
  danger-dark: "#f87171"
  info: "#1d4ed8"
  info-dark: "#60a5fa"
  success-subtle: "#dcfce7"
  success-subtle-dark: "#12301f"
  warning-subtle: "#fef3c7"
  warning-subtle-dark: "#2f250c"
  danger-subtle: "#fee2e2"
  danger-subtle-dark: "#3a1414"
  info-subtle: "#dbeafe"
  info-subtle-dark: "#132640"
  surface-sunken: "#f1f5f9"
  surface-sunken-dark: "#0e1d16"
  surface-overlay: "#ffffff"
  surface-overlay-dark: "#152a20"
  border-subtle: "#e2e8f0"
  border-subtle-dark: "#1f3229"
  ink-secondary: "#475569"
  ink-secondary-dark: "#b4c4bb"
  ink-tertiary: "#5f6b7a"
  ink-tertiary-dark: "#8ea398"
  ink-inverse: "#ffffff"
  ink-inverse-dark: "#08130e"
  map-overlay: "rgba(15, 23, 42, 0.55)"
  map-overlay-dark: "rgba(0, 0, 0, 0.6)"
  modal-overlay: "rgba(15, 23, 42, 0.55)"
  modal-overlay-dark: "rgba(0, 0, 0, 0.6)"
  badge-unread: "#dc2626"
  badge-unread-dark: "#f87171"
  danger-hover: "#991b1b"
  danger-hover-dark: "#fca5a5"
typography:
  display:
    fontFamily: Be Vietnam Pro
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.2
  h1:
    fontFamily: Be Vietnam Pro
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.25
  h2:
    fontFamily: Be Vietnam Pro
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.3
  h3:
    fontFamily: Be Vietnam Pro
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: Be Vietnam Pro
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.55
  body-large:
    fontFamily: Be Vietnam Pro
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: Be Vietnam Pro
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1.4
  meta:
    fontFamily: Be Vietnam Pro
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  xl: 20px
  full: 9999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 20px
  "6": 24px
  "8": 32px
  "10": 40px
  "12": 48px
  "16": 64px
  gutter-mobile: 16px
  gutter-desktop: 24px
  sidebar-width: 240px
  topbar-height: 56px
motion:
  duration-fast: 150ms
  duration-base: 200ms
  ease-standard: cubic-bezier(0.2, 0, 0, 1)
breakpoints:
  mobile: 0px
  tablet: 768px
  desktop: 1024px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.md}"
    height: 44px
  button-accent-hover:
    backgroundColor: "{colors.accent-hover}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: 16px
  sidebar:
    backgroundColor: "{colors.sidebar-bg}"
    textColor: "{colors.sidebar-foreground}"
    width: 240px
  badge-status:
    textColor: "{colors.ink-inverse}"
    typography: "{typography.meta}"
    rounded: "{rounded.full}"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: 44px
---

## Overview

OpenTea DX-OS phục vụ hợp tác xã chè: nông hộ dùng điện thoại ngoài nương, cán bộ kỹ thuật và ban quản trị dùng máy tính. Giao diện bình tĩnh, rõ ràng, có cảm giác của lá chè: nền trung tính hơi xanh, một màu chính xanh chè và đúng một màu nhấn hổ phách (màu búp chè sao khô). Dữ liệu nghiệp vụ (thửa, lô, nhật ký, cách ly) luôn quan trọng hơn trang trí.

Nguồn sự thật cho giá trị là `apps/web/src/styles/globals.css`. Tệp này mô tả cùng các giá trị đó kèm lý do; test `apps/web/src/__tests__/design/theme-tokens.test.ts` kiểm tra hai nơi khớp nhau, mọi màu sáng đều có giá trị tối, và các cặp chữ/nền đạt WCAG AA.

## Colors

Token màu nằm trên `:root`. Màu tối nằm trong `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` và lặp lại y hệt trong `:root[data-theme="dark"]`. Trong front matter, khóa có hậu tố `-dark` là giá trị tối của khóa cùng tên. Tên khóa là tên biến CSS bỏ `--` và tiền tố `color-` (ví dụ `--color-ink-secondary` là `ink-secondary`).

- **Primary (#176c4b):** xanh chè, màu thương hiệu. Nút chính, liên kết, viền focus. Ở chế độ tối dùng `#4cc38a` để chữ và liên kết vẫn đọc được trên nền xanh rất đậm; khi đó chữ trên nút chính chuyển sang màu tối (`primary-foreground-dark`).
- **Accent (#b45309):** hổ phách, màu nhấn duy nhất. Dùng cho điểm nhấn và hành động phụ quan trọng, không dùng để báo lỗi. Ở chế độ tối là `#f2b544` với chữ tối.
- **Accent lime (#d6f05c):** chỉ dùng cho khối logo trong sidebar và trang đăng nhập.
- **Nền:** sáng `#f5f7f3`, thẻ `#ffffff`; tối `#0b1712` (xanh rất đậm) và thẻ `#112219`. Sidebar giữ màu xanh đậm ở cả hai chế độ.
- **Trạng thái thửa (tập đóng):** `status-sowing`, `status-tending`, `status-harvest-approved`, `status-harvested`, `status-draft`. Chỉ dùng cho huy hiệu trạng thái thửa, chữ là `ink-inverse`.
- **Phản hồi:** `success`, `warning`, `danger`, `info` dùng làm chữ hoặc biểu tượng trên `*-subtle` hoặc trên thẻ; `danger` và `info` cũng làm nền nút với chữ `ink-inverse`.
- **Chữ:** `foreground` (ink-primary) cho nội dung, `ink-secondary` cho mô tả, `ink-tertiary` và `muted-foreground` cho chú thích. `ink-inverse` là chữ trên nền màu đặc: trắng ở chế độ sáng, gần đen ở chế độ tối vì nền màu đặc ở chế độ tối sáng hơn.

**Tương phản:** mọi cặp chữ/nền đạt WCAG AA 4,5:1 cho chữ thường ở cả hai chế độ. Danh sách cặp nằm trong `TEXT_PAIRS` của test token; thêm cặp mới khi thêm cách dùng mới.

**Không mã màu cứng:** file `*.module.css` và `*.tsx` chỉ được dùng `var(--...)` hoặc class Tailwind trỏ tới token (`bg-primary`, `text-ink-secondary`, `bg-danger-subtle`...). Test `no-hardcoded-colors.test.ts` chặn mã hex, `rgb()`, `hsl()` và class bảng màu cố định của Tailwind; danh sách `baseline` chỉ được thu nhỏ, `exceptions` phải ghi lý do.

## Typography

Một họ chữ: **Be Vietnam Pro** (tải qua `next/font/google`, biến `--font-be-vietnam`, có bộ ký tự tiếng Việt), dự phòng `system-ui`. Chữ số dạng bảng dùng `JetBrains Mono` cho mã lô và mã thửa. Cỡ chữ thân 15px; vai trò nông hộ (`[data-role="farmer"]`) tăng lên 17px để đọc ngoài trời trên điện thoại. Tiêu đề đậm 600–700, không viết hoa toàn bộ trừ nhãn nhỏ.

## Layout

Lưới khoảng cách 4px (`spacing`). Lề trang 16px trên điện thoại, 24px từ 1024px. Sidebar 240px, topbar 56px. Breakpoint: dưới 768px là điện thoại (một cột, điều hướng đáy cho nông hộ), từ 1024px hiện sidebar cố định. Không được tràn ngang trang ở 390px. Vùng chạm tối thiểu 44px.

## Elevation & Depth

Độ sâu nhẹ, chủ yếu bằng viền `border`/`border-subtle`; bóng chỉ cho thẻ nổi và hộp thoại.

| Token | Sáng | Tối |
| --- | --- | --- |
| `--shadow-card` | `0 1px 4px rgba(15, 23, 42, 0.06)` | `0 1px 4px rgba(0, 0, 0, 0.4)` |
| `--shadow-card-hover` | `0 4px 16px rgba(15, 23, 42, 0.10)` | `0 4px 16px rgba(0, 0, 0, 0.5)` |
| `--shadow-modal` | `0 10px 25px rgba(15, 23, 42, 0.15)` | `0 10px 25px rgba(0, 0, 0, 0.6)` |

Lớp phủ bản đồ và hộp thoại: `map-overlay`, `modal-overlay`.

**Chuyển động:** 150ms cho hover/focus, 200ms cho mở/đóng, đường cong `cubic-bezier(0.2, 0, 0, 1)` (`--motion-*`). Không hoạt ảnh trang trí.

## Shapes

Bo góc vừa phải: 6px cho điều khiển nhỏ, 10px cho nút và ô nhập, 14px cho thẻ, 20px cho khối lớn, `full` cho huy hiệu và avatar.

## Components

- **Nút:** `button-primary` cho một hành động chính mỗi màn hình; `button-accent` cho điểm nhấn phụ; `button-danger` cho xóa. Cao tối thiểu 44px.
- **Thẻ:** nền `card`, viền `border`, bo 14px, đệm 16px.
- **Sidebar:** nền `sidebar-bg`, chữ `sidebar-foreground`, cùng màu ở hai chế độ.
- **Nút giao diện (`ThemeToggle`):** xoay vòng Sáng → Tối → Theo hệ thống, lưu ở `localStorage` khóa `opentea-theme`. Có tên truy cập, viền focus `border-focus`, dùng được bằng bàn phím. Có ở topbar, trang chủ và trang đăng nhập.
- **Nút lọc (App Store):** viên thuốc cao tối thiểu 44px, bo `full`, viền `border`. Là nút bật tắt có `aria-pressed`; khi bật nền `primary-subtle`, viền và chữ `primary`, chữ đậm (không chỉ đổi màu). Các nút xếp hàng và xuống dòng, không cuộn ngang trang.
- **Tiến trình theo bước (App Store):** danh sách có thứ tự, mỗi bước là một chấm tròn 24px kèm tên. Bước xong có dấu ✓ trên `success-subtle`, bước đang chạy là chấm `primary` và đặt `aria-current="step"`, bước hỏng có dấu ! trên `danger-subtle` kèm chữ "Lỗi"; lý do và hướng xử lý nằm trong khối `danger-subtle` có `role="alert"`. Các bước xuống dòng ở 390px.
- **Dải ảnh màn hình (App Store):** hàng ngang các ảnh rộng `min(640px, 86vw)` giữ tỉ lệ ảnh, mỗi ảnh là liên kết mở ảnh lớn ở thẻ mới (`aria-label` "Xem ảnh lớn: <chú thích>"), viền `border`, bo 10px, chú thích `meta` bên dưới. Dải tự cuộn trong chính nó (`overflow-x: auto`), không làm trang tràn ngang; ảnh tải lười và có `alt` là chú thích.
- **Bộ giao diện mini-app (`apps/web/public/dxos-app.css`):** chỉ dùng token đã có, đúng ở sáng và tối, không tràn ngang ở 390px, có `:focus-visible`. Thành phần: `app-header`, `tabs` (cuộn trong thanh), `stats` (2 cột ở điện thoại, 4 từ 768px), `chart` (thanh SVG do máy chủ sinh, chiều dài là thuộc tính SVG, không `style=`), `toolbar`, `pagination`, `cards`, `steps` (✓ cho bước xong, bước hiện tại tô `primary`), `empty`, `field-error`, `disclosure`, `actions`, `a.button` và `.danger`, `print-sheet`/`no-print`/`print-only` với `@media print` bỏ nền, màu, điều hướng và nút. Macro và ví dụ ở `platform/appkit/`, mô tả trong `docs/miniapps.md`.
- **Không nhấp nháy:** `layout.tsx` chạy một đoạn script nội tuyến trước lần vẽ đầu, trong `try/catch`, để đặt `data-theme` từ lựa chọn đã lưu; không có lựa chọn hoặc `system` thì để trống và theo `prefers-color-scheme`.

## Do's and Don'ts

- Dùng token, không dùng mã màu; cần màu mới thì thêm token vào `globals.css` và tệp này cùng lúc, có giá trị tối.
- Giữ một màu nhấn hổ phách; không thêm màu nhấn thứ hai.
- Kiểm tra cả chế độ sáng và tối, ở 1280px và 390px, trước khi báo xong.
- Không dùng màu làm tín hiệu duy nhất: trạng thái luôn có chữ hoặc biểu tượng kèm theo.
- Không đổi màu chính `#176c4b` của chế độ sáng.
