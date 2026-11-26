// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small drawings and photos shipped with the page */

import React from 'react'
import Link from 'next/link'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: "Đơn hàng" }

/** Laid out as designed; there is no data source yet, so everything on it is sample content. */
export default function OfficerOrdersPage() {
  return (
    <div className={styles.page}>
<div className={[styles["hd"]].join(' ')}>
<span className={[styles["hico"]].join(' ')}>
<svg aria-hidden="true" width={"28"} height={"28"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M7.5 4.27l9 5.15M21 8 12 13 3 8l9-5zM3 8v8l9 5 9-5V8M12 13v8"}>
</path>
</svg>
</span>
<div style={{ flex: "1 1 320px" }}>
<h1 className={[styles["h1"]].join(' ')}>
{"Đơn hàng"}
</h1>
<p className={[styles["sub"]].join(' ')}>
{"1 đơn chờ xác nhận"}
</p>
</div>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Chỉ xem (cán bộ)"}
</span>
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "14px" }}>
<div className={[styles["st"]].join(' ')}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-warning)" }}>
<svg aria-hidden="true" width={"22"} height={"22"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
</span>
<span >
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Chờ xác nhận"}
</span>
<strong style={{ fontSize: "22px", color: "var(--color-ink-heading)" }}>
{"1"}
</strong>
</span>
</div>
<div className={[styles["st"]].join(' ')}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-success-subtle)", color: "var(--color-success)" }}>
<svg aria-hidden="true" width={"22"} height={"22"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M20 6 9 17l-5-5"}>
</path>
</svg>
</span>
<span >
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Đã xác nhận"}
</span>
<strong style={{ fontSize: "22px", color: "var(--color-ink-heading)" }}>
{"2"}
</strong>
</span>
</div>
<div className={[styles["st"]].join(' ')}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
<svg aria-hidden="true" width={"22"} height={"22"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"}>
</path>
</svg>
</span>
<span >
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Đã huỷ"}
</span>
<strong style={{ fontSize: "22px", color: "var(--color-ink-heading)" }}>
{"1"}
</strong>
</span>
</div>
</div>
<div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
<div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", padding: "14px 18px", flexWrap: "wrap" }}>
<span style={{ display: "flex", paddingLeft: "10px", flex: "none" }}>
<span style={{ width: "46px", height: "46px", borderRadius: "10px", background: "var(--color-primary-subtle)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface-card)", marginLeft: "-10px", overflow: "hidden", flex: "none" }}>
<img src={"/images/officer/art-5.svg"} alt={""} width={"52"} height={"52"} style={{ maxWidth: "100%" }} />
</span>
<span style={{ width: "46px", height: "46px", borderRadius: "10px", background: "var(--color-primary-subtle)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface-card)", marginLeft: "-10px", overflow: "hidden", flex: "none" }}>
<img src={"/images/officer/art-6.svg"} alt={""} width={"52"} height={"52"} style={{ maxWidth: "100%" }} />
</span>
</span>
<span style={{ flex: "1 1 200px", minWidth: "0" }}>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"DH-0142"}
</span>
<br  />
<strong style={{ fontSize: "15px" }}>
{"Nguyễn Thị Hà"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)", display: "block" }}>
{"0935 111 222"}
</span>
</span>
<strong style={{ fontSize: "17px", flex: "none" }}>
{"740.000 ₫"}
</strong>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)" }}>
{"Chờ xác nhận"}
</span>
<Link href={"/officer/orders/DH-0142"} className={[styles["btn2"]].join(' ')} style={{ height: "34px", flex: "none" }}>
{"Chi tiết"}
</Link>
</div>
<div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", padding: "14px 18px", flexWrap: "wrap" }}>
<span style={{ display: "flex", paddingLeft: "10px", flex: "none" }}>
<span style={{ width: "46px", height: "46px", borderRadius: "10px", background: "var(--color-warning-subtle)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface-card)", marginLeft: "-10px", overflow: "hidden", flex: "none" }}>
<img src={"/images/officer/art-7.svg"} alt={""} width={"52"} height={"52"} style={{ maxWidth: "100%" }} />
</span>
<span style={{ width: "46px", height: "46px", borderRadius: "10px", background: "var(--color-primary-subtle)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface-card)", marginLeft: "-10px", overflow: "hidden", flex: "none" }}>
<img src={"/images/officer/art-6.svg"} alt={""} width={"52"} height={"52"} style={{ maxWidth: "100%" }} />
</span>
</span>
<span style={{ flex: "1 1 200px", minWidth: "0" }}>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"DH-0141"}
</span>
<br  />
<strong style={{ fontSize: "15px" }}>
{"Lê Văn Minh"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)", display: "block" }}>
{"0988 222 333"}
</span>
</span>
<strong style={{ fontSize: "17px", flex: "none" }}>
{"330.000 ₫"}
</strong>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Đã xác nhận"}
</span>
<button type="button" disabled title="Chỉ đơn DH-0142 có trang chi tiết mẫu" className={[styles["btn2"]].join(' ')} style={{ height: "34px", flex: "none" }}>
{"Chi tiết"}
</button>
</div>
<div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", padding: "14px 18px", flexWrap: "wrap" }}>
<span style={{ display: "flex", paddingLeft: "10px", flex: "none" }}>
<span style={{ width: "46px", height: "46px", borderRadius: "10px", background: "var(--color-primary-subtle)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface-card)", marginLeft: "-10px", overflow: "hidden", flex: "none" }}>
<img src={"/images/officer/art-5.svg"} alt={""} width={"52"} height={"52"} style={{ maxWidth: "100%" }} />
</span>
</span>
<span style={{ flex: "1 1 200px", minWidth: "0" }}>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"DH-0140"}
</span>
<br  />
<strong style={{ fontSize: "15px" }}>
{"Trần Thu Hương"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)", display: "block" }}>
{"0912 000 111"}
</span>
</span>
<strong style={{ fontSize: "17px", flex: "none" }}>
{"185.000 ₫"}
</strong>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Đã xác nhận"}
</span>
<button type="button" disabled title="Chỉ đơn DH-0142 có trang chi tiết mẫu" className={[styles["btn2"]].join(' ')} style={{ height: "34px", flex: "none" }}>
{"Chi tiết"}
</button>
</div>
<div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", padding: "14px 18px", flexWrap: "wrap" }}>
<span style={{ display: "flex", paddingLeft: "10px", flex: "none" }}>
<span style={{ width: "46px", height: "46px", borderRadius: "10px", background: "var(--color-danger-subtle)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface-card)", marginLeft: "-10px", overflow: "hidden", flex: "none" }}>
<img src={"/images/officer/art-8.svg"} alt={""} width={"52"} height={"52"} style={{ maxWidth: "100%" }} />
</span>
</span>
<span style={{ flex: "1 1 200px", minWidth: "0" }}>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"DH-0139"}
</span>
<br  />
<strong style={{ fontSize: "15px" }}>
{"Phạm Quốc Bảo"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)", display: "block" }}>
{"0977 444 555"}
</span>
</span>
<strong style={{ fontSize: "17px", flex: "none" }}>
{"420.000 ₫"}
</strong>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Đã huỷ"}
</span>
<button type="button" disabled title="Chỉ đơn DH-0142 có trang chi tiết mẫu" className={[styles["btn2"]].join(' ')} style={{ height: "34px", flex: "none" }}>
{"Chi tiết"}
</button>
</div>
</div>
    </div>
  )
}
