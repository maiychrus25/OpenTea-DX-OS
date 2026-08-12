// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import Link from "next/link"

export default function UnauthorizedPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1 style={{ color: 'red' }}>403 - KHÃ”NG CÃ“ QUYá»€N TRUY Cáº¬P</h1>
      <p>Báº¡n khÃ´ng cÃ³ quyá»n truy cáº­p vÃ o trang nÃ y dá»±a trÃªn chá»©c vá»¥ cá»§a báº¡n.</p>
      <Link href="/" style={{ marginTop: '20px', color: 'blue', textDecoration: 'underline' }}>
        Quay láº¡i trang chá»§
      </Link>
    </div>
  )
}
