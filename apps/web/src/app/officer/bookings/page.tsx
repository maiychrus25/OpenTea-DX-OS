// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small drawings and photos shipped with the page */

import React from 'react'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: "Lượt đặt tour" }

/** Laid out as designed; there is no data source yet, so everything on it is sample content. */
export default function OfficerBookingsPage() {
  return (
    <div className={styles.page}>
<div className={[styles["hd"]].join(' ')}>
<span className={[styles["hico"]].join(' ')}>
<svg aria-hidden="true" width={"28"} height={"28"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
</span>
<div style={{ flex: "1 1 320px" }}>
<h1 className={[styles["h1"]].join(' ')}>
{"Lượt đặt tour"}
</h1>
<p className={[styles["sub"]].join(' ')}>
{"Khách đặt khi tour đã được đăng, không cần HTX duyệt."}
</p>
</div>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Chỉ xem (cán bộ)"}
</span>
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "14px" }}>
<div className={[styles["st"]].join(' ')}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-success-subtle)", color: "var(--color-success)" }}>
<svg aria-hidden="true" width={"22"} height={"22"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
</span>
<span >
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Đoàn sắp đi"}
</span>
<strong style={{ fontSize: "22px", color: "var(--color-ink-heading)" }}>
{"3"}
</strong>
</span>
</div>
<div className={[styles["st"]].join(' ')}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-info-subtle)", color: "var(--color-info)" }}>
<svg aria-hidden="true" width={"22"} height={"22"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM15.5 12.9 17 22l-5-3-5 3 1.5-9.1"}>
</path>
</svg>
</span>
<span >
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Giá trị đặt (không tính đã huỷ)"}
</span>
<strong style={{ fontSize: "22px", color: "var(--color-ink-heading)" }}>
{"4.130.000 ₫"}
</strong>
</span>
</div>
</div>
<div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
<span style={{ border: "1px solid var(--color-primary)", background: "var(--color-primary)", color: "var(--color-surface-card)", fontWeight: "600", fontSize: "13px", borderRadius: "99px", padding: "7px 16px" }}>
{"Tất cả"}
</span>
<span style={{ border: "1px solid var(--color-border-input)", background: "var(--color-surface-card)", color: "var(--color-ink-tertiary)", fontWeight: "600", fontSize: "13px", borderRadius: "99px", padding: "7px 16px" }}>
{"Đã đặt"}
</span>
<span style={{ border: "1px solid var(--color-border-input)", background: "var(--color-surface-card)", color: "var(--color-ink-tertiary)", fontWeight: "600", fontSize: "13px", borderRadius: "99px", padding: "7px 16px" }}>
{"Đã huỷ"}
</span>
</div>
<div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
<div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", padding: "12px 18px 12px 12px", flexWrap: "wrap" }}>
<span style={{ width: "96px", height: "76px", borderRadius: "10px", overflow: "hidden", flex: "none", display: "block" }}>
<span style={{ position: "relative", display: "block", height: "76px", overflow: "hidden", background: "var(--sidebar-bg)" }}>
<img src={"/images/officer/tea-mist.jpg"} alt={""} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "85% 90%", transform: "scale(1.6)", transformOrigin: "85% 90%" }} />
</span>
</span>
<span style={{ flex: "1 1 260px", minWidth: "0" }}>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"TB-0231"}
</span>
 
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"· Nguyễn Văn Nam"}
</span>
<br  />
<strong style={{ fontSize: "15px" }}>
{"Trải nghiệm hái chè Tân Cương"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)", display: "flex", gap: "14px", marginTop: "3px", flexWrap: "wrap" }}>
<span style={{ display: "flex", gap: "5px", alignItems: "center", whiteSpace: "nowrap" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
{"28/11/2026"}
</span>
<span style={{ display: "flex", gap: "5px", alignItems: "center", whiteSpace: "nowrap" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"}>
</path>
</svg>
{"4 khách"}
</span>
</span>
</span>
<strong style={{ fontSize: "17px", flex: "none" }}>
{"1.650.000 ₫"}
</strong>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Đã đặt"}
</span>
</div>
<div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", padding: "12px 18px 12px 12px", flexWrap: "wrap" }}>
<span style={{ width: "96px", height: "76px", borderRadius: "10px", overflow: "hidden", flex: "none", display: "block" }}>
<span style={{ position: "relative", display: "block", height: "76px", overflow: "hidden", background: "var(--sidebar-bg)" }}>
<img src={"/images/officer/tea-mist.jpg"} alt={""} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "35% 35%", transform: "scale(1.4)", transformOrigin: "35% 35%" }} />
</span>
</span>
<span style={{ flex: "1 1 260px", minWidth: "0" }}>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"TB-0230"}
</span>
 
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"· Phạm Thị Lan"}
</span>
<br  />
<strong style={{ fontSize: "15px" }}>
{"Thưởng trà trên đồi"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)", display: "flex", gap: "14px", marginTop: "3px", flexWrap: "wrap" }}>
<span style={{ display: "flex", gap: "5px", alignItems: "center", whiteSpace: "nowrap" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
{"27/11/2026"}
</span>
<span style={{ display: "flex", gap: "5px", alignItems: "center", whiteSpace: "nowrap" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"}>
</path>
</svg>
{"2 khách"}
</span>
</span>
</span>
<strong style={{ fontSize: "17px", flex: "none" }}>
{"580.000 ₫"}
</strong>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Đã đặt"}
</span>
</div>
<div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", padding: "12px 18px 12px 12px", flexWrap: "wrap" }}>
<span style={{ width: "96px", height: "76px", borderRadius: "10px", overflow: "hidden", flex: "none", display: "block" }}>
<span style={{ position: "relative", display: "block", height: "76px", overflow: "hidden", background: "var(--sidebar-bg)" }}>
<img src={"/images/officer/tea-sunrise.jpg"} alt={""} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 85%", transform: "scale(1.5)", transformOrigin: "50% 85%" }} />
</span>
</span>
<span style={{ flex: "1 1 260px", minWidth: "0" }}>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"TB-0229"}
</span>
 
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"· Đỗ Minh Quân"}
</span>
<br  />
<strong style={{ fontSize: "15px" }}>
{"Một ngày làm người nông dân chè"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)", display: "flex", gap: "14px", marginTop: "3px", flexWrap: "wrap" }}>
<span style={{ display: "flex", gap: "5px", alignItems: "center", whiteSpace: "nowrap" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
{"30/11/2026"}
</span>
<span style={{ display: "flex", gap: "5px", alignItems: "center", whiteSpace: "nowrap" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"}>
</path>
</svg>
{"5 khách"}
</span>
</span>
</span>
<strong style={{ fontSize: "17px", flex: "none" }}>
{"1.900.000 ₫"}
</strong>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Đã đặt"}
</span>
</div>
<div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", padding: "12px 18px 12px 12px", flexWrap: "wrap" }}>
<span style={{ width: "96px", height: "76px", borderRadius: "10px", overflow: "hidden", flex: "none", display: "block" }}>
<span style={{ position: "relative", display: "block", height: "76px", overflow: "hidden", background: "var(--sidebar-bg)" }}>
<img src={"/images/officer/tea-mist.jpg"} alt={""} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "35% 35%", transform: "scale(1.4)", transformOrigin: "35% 35%" }} />
</span>
</span>
<span style={{ flex: "1 1 260px", minWidth: "0" }}>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"TB-0228"}
</span>
 
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"· Vũ Hải Yến"}
</span>
<br  />
<strong style={{ fontSize: "15px" }}>
{"Thưởng trà trên đồi"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)", display: "flex", gap: "14px", marginTop: "3px", flexWrap: "wrap" }}>
<span style={{ display: "flex", gap: "5px", alignItems: "center", whiteSpace: "nowrap" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
{"25/11/2026"}
</span>
<span style={{ display: "flex", gap: "5px", alignItems: "center", whiteSpace: "nowrap" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"}>
</path>
</svg>
{"3 khách"}
</span>
</span>
</span>
<strong style={{ fontSize: "17px", flex: "none" }}>
{"870.000 ₫"}
</strong>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Đã huỷ"}
</span>
</div>
</div>
    </div>
  )
}
