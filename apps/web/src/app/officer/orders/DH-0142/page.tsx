// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small drawings and photos shipped with the page */

import React from 'react'
import Link from 'next/link'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: "Chi tiết đơn" }

/** Laid out as designed; there is no data source yet, so everything on it is sample content. */
export default function OfficerOrderPage() {
  return (
    <div className={styles.page}>
<Link href={"/officer/orders"} style={{ fontSize: "14px", color: "var(--color-primary)", fontWeight: "600", textDecoration: "none" }}>
{"← Quay lại"}
</Link>
<div className={[styles["hd"]].join(' ')}>
<span className={[styles["hico"]].join(' ')}>
<svg aria-hidden="true" width={"28"} height={"28"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M7.5 4.27l9 5.15M21 8 12 13 3 8l9-5zM3 8v8l9 5 9-5V8M12 13v8"}>
</path>
</svg>
</span>
<div style={{ flex: "1 1 320px" }}>
<h1 className={[styles["h1"]].join(' ')}>
{"Chi tiết đơn"}
</h1>
</div>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Chỉ xem (cán bộ)"}
</span>
</div>
<div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
<section className={[styles["pn"]].join(' ')} style={{ flex: "1 1 360px" }}>
<div className={[styles["ph"]].join(' ')}>
{"DH-0142"}
</div>
<div style={{ display: "flex", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", gap: "12px" }}>
<span style={{ width: "160px", fontSize: "13.5px", color: "var(--color-ink-secondary)" }}>
{"Người nhận"}
</span>
<strong style={{ flex: "1", fontSize: "14px" }}>
{"Nguyễn Thị Hà"}
</strong>
</div>
<div style={{ display: "flex", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", gap: "12px" }}>
<span style={{ width: "160px", fontSize: "13.5px", color: "var(--color-ink-secondary)" }}>
{"Điện thoại"}
</span>
<strong style={{ flex: "1", fontSize: "14px" }}>
{"0935 111 222"}
</strong>
</div>
<div style={{ display: "flex", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", gap: "12px" }}>
<span style={{ width: "160px", fontSize: "13.5px", color: "var(--color-ink-secondary)" }}>
{"Địa chỉ"}
</span>
<strong style={{ flex: "1", fontSize: "14px" }}>
{"Xóm Cầu Gỗ, xã Tân Cương"}
</strong>
</div>
<div style={{ display: "flex", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", gap: "12px" }}>
<span style={{ width: "160px", fontSize: "13.5px", color: "var(--color-ink-secondary)" }}>
{"Thanh toán"}
</span>
<strong style={{ flex: "1", fontSize: "14px" }}>
{"Chuyển khoản"}
</strong>
</div>
<div style={{ display: "flex", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", gap: "12px" }}>
<span style={{ width: "160px", fontSize: "13.5px", color: "var(--color-ink-secondary)" }}>
{"Tổng"}
</span>
<strong style={{ flex: "1", fontSize: "14px" }}>
{"740.000 ₫"}
</strong>
</div>
</section>
<section className={[styles["pn"]].join(' ')} style={{ flex: "1 1 360px" }}>
<div className={[styles["ph"]].join(' ')}>
{"Sản phẩm"}
</div>
<div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)" }}>
<span style={{ width: "64px", height: "64px", borderRadius: "10px", background: "var(--color-primary-subtle)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
<img src={"/images/officer/art-5.svg"} alt={""} width={"72"} height={"72"} style={{ maxWidth: "100%" }} />
</span>
<strong style={{ flex: "1", fontSize: "14.5px" }}>
{"Chè Shan tuyết búp"}
</strong>
<strong style={{ fontSize: "14px" }}>
{"2 × 185.000 ₫"}
</strong>
</div>
<div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)" }}>
<span style={{ width: "64px", height: "64px", borderRadius: "10px", background: "var(--color-primary-subtle)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
<img src={"/images/officer/art-6.svg"} alt={""} width={"72"} height={"72"} style={{ maxWidth: "100%" }} />
</span>
<strong style={{ flex: "1", fontSize: "14.5px" }}>
{"Chè xanh Tân Cương"}
</strong>
<strong style={{ fontSize: "14px" }}>
{"3 × 120.000 ₫"}
</strong>
</div>
</section>
</div>
    </div>
  )
}
