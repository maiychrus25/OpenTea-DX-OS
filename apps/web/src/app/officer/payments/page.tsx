// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small drawings and photos shipped with the page */

import React from 'react'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: "Doanh thu" }

/** Laid out as designed; there is no data source yet, so everything on it is sample content. */
export default function OfficerPaymentsPage() {
  return (
    <div className={styles.page}>
<div className={[styles["hd"]].join(' ')}>
<span className={[styles["hico"]].join(' ')}>
<svg aria-hidden="true" width={"28"} height={"28"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z"}>
</path>
</svg>
</span>
<div style={{ flex: "1 1 320px" }}>
<h1 className={[styles["h1"]].join(' ')}>
{"Doanh thu"}
</h1>
<p className={[styles["sub"]].join(' ')}>
{"Tổng hợp doanh thu từ gian hàng sản phẩm và tour của HTX."}
</p>
</div>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Chỉ xem (cán bộ)"}
</span>
</div>
<section style={{ position: "relative", height: "160px", borderRadius: "10px", overflow: "hidden", background: "var(--sidebar-bg)" }}>
<img src={"/images/officer/tea-sunrise.jpg"} alt={""} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 60%" }} />
<div style={{ position: "absolute", inset: "0", background: "linear-gradient(90deg,color-mix(in srgb, var(--video-shade) 82%, transparent),color-mix(in srgb, var(--video-shade) 15%, transparent) 70%)" }}>
</div>
<div style={{ position: "absolute", left: "28px", right: "28px", top: "0", bottom: "0", display: "flex", flexDirection: "column", justifyContent: "center", gap: "16px" }}>
<strong style={{ color: "var(--color-surface-card)", fontSize: "22px", maxWidth: "520px", lineHeight: "1.3" }}>
{"Doanh thu của hợp tác xã"}
</strong>
<div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
<span style={{ background: "color-mix(in srgb, var(--color-ink-inverse) 18%, transparent)", border: "1px solid color-mix(in srgb, var(--color-ink-inverse) 35%, transparent)", borderRadius: "10px", padding: "10px 16px", color: "var(--color-surface-card)", display: "flex", flexDirection: "column", gap: "2px", backdropFilter: "blur(4px)" }}>
<span style={{ fontSize: "12px", opacity: ".85" }}>
{"Tổng doanh thu"}
</span>
<strong style={{ fontSize: "20px", whiteSpace: "nowrap" }}>
{"3.555.000 ₫"}
</strong>
</span>
<span style={{ background: "color-mix(in srgb, var(--color-ink-inverse) 18%, transparent)", border: "1px solid color-mix(in srgb, var(--color-ink-inverse) 35%, transparent)", borderRadius: "10px", padding: "10px 16px", color: "var(--color-surface-card)", display: "flex", flexDirection: "column", gap: "2px", backdropFilter: "blur(4px)" }}>
<span style={{ fontSize: "12px", opacity: ".85" }}>
{"Gian hàng"}
</span>
<strong style={{ fontSize: "20px", whiteSpace: "nowrap" }}>
{"1.075.000 ₫"}
</strong>
</span>
<span style={{ background: "color-mix(in srgb, var(--color-ink-inverse) 18%, transparent)", border: "1px solid color-mix(in srgb, var(--color-ink-inverse) 35%, transparent)", borderRadius: "10px", padding: "10px 16px", color: "var(--color-surface-card)", display: "flex", flexDirection: "column", gap: "2px", backdropFilter: "blur(4px)" }}>
<span style={{ fontSize: "12px", opacity: ".85" }}>
{"Tour"}
</span>
<strong style={{ fontSize: "20px", whiteSpace: "nowrap" }}>
{"2.480.000 ₫"}
</strong>
</span>
</div>
</div>
</section>
<div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "stretch" }}>
<section className={[styles["pn"]].join(' ')} style={{ flex: "2 1 480px", minWidth: "0" }}>
<div className={[styles["ph"]].join(' ')}>
{"Doanh thu theo ngày"}
</div>
<div style={{ padding: "14px 18px 10px" }}>
<img src={"/images/officer/art-9.svg"} alt={"Doanh thu theo ngày"} width={"100%"} style={{ maxWidth: "100%" }} />
<div style={{ display: "flex", gap: "18px", paddingTop: "4px" }}>
<span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-ink-tertiary)" }}>
<span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "var(--color-primary)" }}>
</span>
{"Tour"}
</span>
<span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-ink-tertiary)" }}>
<span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "var(--color-sidebar-badge)" }}>
</span>
{"Gian hàng"}
</span>
<span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--color-ink-secondary)" }}>
{"Đơn vị: nghìn đồng (k), triệu đồng (tr)"}
</span>
</div>
</div>
</section>
<section className={[styles["pn"]].join(' ')} style={{ flex: "1 1 300px", minWidth: "0" }}>
<div className={[styles["ph"]].join(' ')}>
{"Cơ cấu doanh thu"}
</div>
<div style={{ padding: "16px 18px" }}>
<div style={{ display: "flex", height: "22px", borderRadius: "99px", overflow: "hidden", margin: "6px 0 14px" }}>
<span style={{ width: "69.8%", background: "var(--color-primary)" }}>
</span>
<span style={{ width: "30.2%", background: "var(--color-sidebar-badge)" }}>
</span>
</div>
<div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid var(--color-border-row)" }}>
<span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "var(--color-primary)" }}>
</span>
<span style={{ flex: "1", fontSize: "14px" }}>
{"Tour"}
</span>
<strong style={{ fontSize: "15px" }}>
{"2.480.000 ₫"}
</strong>
<span style={{ width: "56px", textAlign: "right", fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"69,8%"}
</span>
</div>
<div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid var(--color-border-row)" }}>
<span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "var(--color-sidebar-badge)" }}>
</span>
<span style={{ flex: "1", fontSize: "14px" }}>
{"Gian hàng"}
</span>
<strong style={{ fontSize: "15px" }}>
{"1.075.000 ₫"}
</strong>
<span style={{ width: "56px", textAlign: "right", fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"30,2%"}
</span>
</div>
<div style={{ display: "flex", justifyContent: "space-between", paddingTop: "12px", fontSize: "14px" }}>
<span style={{ color: "var(--color-ink-secondary)" }}>
{"Tổng cộng"}
</span>
<strong style={{ fontSize: "17px", color: "var(--color-primary)" }}>
{"3.555.000 ₫"}
</strong>
</div>
</div>
</section>
</div>
<div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
<span style={{ border: "1px solid var(--color-primary)", background: "var(--color-primary)", color: "var(--color-surface-card)", fontWeight: "600", fontSize: "13px", borderRadius: "99px", padding: "7px 16px" }}>
{"Tất cả"}
</span>
<span style={{ border: "1px solid var(--color-border-input)", background: "var(--color-surface-card)", color: "var(--color-ink-tertiary)", fontWeight: "600", fontSize: "13px", borderRadius: "99px", padding: "7px 16px" }}>
{"Gian hàng"}
</span>
<span style={{ border: "1px solid var(--color-border-input)", background: "var(--color-surface-card)", color: "var(--color-ink-tertiary)", fontWeight: "600", fontSize: "13px", borderRadius: "99px", padding: "7px 16px" }}>
{"Tour"}
</span>
</div>
<section className={[styles["pn"]].join(' ')}>
<div style={{ overflowX: "auto" }}>
<table style={{ borderCollapse: "collapse", width: "100%" }}>
<thead >
<tr >
<th className={[styles["th"]].join(' ')}>
{"Ngày"}
</th>
<th className={[styles["th"]].join(' ')}>
{"Nguồn"}
</th>
<th className={[styles["th"]].join(' ')}>
{"Mã"}
</th>
<th className={[styles["th"]].join(' ')}>
{"Doanh thu"}
</th>
</tr>
</thead>
<tbody >
<tr >
<td className={[styles["td"]].join(' ')}>
{"27/11/2026"}
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Tour"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["mono"]].join(' ')}>
{"TB-0230"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<strong >
{"580.000 ₫"}
</strong>
</td>
</tr>
<tr >
<td className={[styles["td"]].join(' ')}>
{"26/11/2026"}
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Tour"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["mono"]].join(' ')}>
{"TB-0229"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<strong >
{"1.900.000 ₫"}
</strong>
</td>
</tr>
<tr >
<td className={[styles["td"]].join(' ')}>
{"25/11/2026"}
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)" }}>
{"Gian hàng"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["mono"]].join(' ')}>
{"DH-0141"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<strong >
{"330.000 ₫"}
</strong>
</td>
</tr>
<tr >
<td className={[styles["td"]].join(' ')}>
{"24/11/2026"}
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)" }}>
{"Gian hàng"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["mono"]].join(' ')}>
{"DH-0140"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<strong >
{"185.000 ₫"}
</strong>
</td>
</tr>
<tr >
<td className={[styles["td"]].join(' ')}>
{"22/11/2026"}
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)" }}>
{"Gian hàng"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<span className={[styles["mono"]].join(' ')}>
{"DH-0138"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
<strong >
{"560.000 ₫"}
</strong>
</td>
</tr>
</tbody>
</table>
</div>
</section>
    </div>
  )
}
