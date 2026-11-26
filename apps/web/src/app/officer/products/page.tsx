// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small drawings and photos shipped with the page */

import React from 'react'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: "Sản phẩm" }

/** Laid out as designed; there is no data source yet, so everything on it is sample content. */
export default function OfficerProductsPage() {
  return (
    <div className={styles.page}>
<div className={[styles["hd"]].join(' ')}>
<span className={[styles["hico"]].join(' ')}>
<svg aria-hidden="true" width={"28"} height={"28"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M3 9l1.5-5h15L21 9M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8"}>
</path>
</svg>
</span>
<div style={{ flex: "1 1 320px" }}>
<h1 className={[styles["h1"]].join(' ')}>
{"Sản phẩm"}
</h1>
<p className={[styles["sub"]].join(' ')}>
{"Gian hàng của HTX"}
</p>
</div>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Chỉ xem (cán bộ)"}
</span>
</div>
<div style={{ background: "var(--color-warning-subtle)", border: "1px solid var(--color-warning-subtle)", borderRadius: "10px", padding: "12px 16px", fontSize: "14px", color: "var(--color-warning)" }}>
{"Chỉnh sửa sản phẩm sẽ làm cùng API ở mốc M2; hiện chỉ xem."}
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "16px" }}>
<div style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
<div style={{ background: "radial-gradient(circle at 50% 40%,var(--color-surface-card),var(--color-primary-subtle))", display: "flex", justifyContent: "center", padding: "18px 0 10px", position: "relative" }}>
<img src={"/images/officer/art-1.svg"} alt={"SHAN TUYẾT"} width={"170"} height={"170"} style={{ maxWidth: "100%" }} />
<span style={{ position: "absolute", left: "12px", top: "12px" }}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-success-subtle)", color: "var(--color-success)" }}>
{"Còn hàng"}
</span>
</span>
</div>
<div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
<strong style={{ fontSize: "16px" }}>
{"Chè Shan tuyết búp"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Hộp 100 g"}
</span>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "4px" }}>
<strong style={{ fontSize: "18px", color: "var(--color-primary)" }}>
{"185.000 ₫"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Tồn kho: "}
<strong style={{ color: "var(--color-ink-primary)" }}>
{"48"}
</strong>
</span>
</div>
</div>
</div>
<div style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
<div style={{ background: "radial-gradient(circle at 50% 40%,var(--color-surface-card),var(--color-primary-subtle))", display: "flex", justifyContent: "center", padding: "18px 0 10px", position: "relative" }}>
<img src={"/images/officer/art-2.svg"} alt={"TÂN CƯƠNG"} width={"170"} height={"170"} style={{ maxWidth: "100%" }} />
<span style={{ position: "absolute", left: "12px", top: "12px" }}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-success-subtle)", color: "var(--color-success)" }}>
{"Còn hàng"}
</span>
</span>
</div>
<div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
<strong style={{ fontSize: "16px" }}>
{"Chè xanh Tân Cương"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Gói 200 g"}
</span>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "4px" }}>
<strong style={{ fontSize: "18px", color: "var(--color-primary)" }}>
{"120.000 ₫"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Tồn kho: "}
<strong style={{ color: "var(--color-ink-primary)" }}>
{"132"}
</strong>
</span>
</div>
</div>
</div>
<div style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
<div style={{ background: "radial-gradient(circle at 50% 40%,var(--color-surface-card),var(--color-warning-subtle))", display: "flex", justifyContent: "center", padding: "18px 0 10px", position: "relative" }}>
<img src={"/images/officer/art-3.svg"} alt={"KIM TUYÊN"} width={"170"} height={"170"} style={{ maxWidth: "100%" }} />
<span style={{ position: "absolute", left: "12px", top: "12px" }}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-danger-subtle)", color: "var(--color-danger)" }}>
{"Hết hàng"}
</span>
</span>
</div>
<div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
<strong style={{ fontSize: "16px" }}>
{"Trà Kim Tuyên"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Hộp 150 g"}
</span>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "4px" }}>
<strong style={{ fontSize: "18px", color: "var(--color-primary)" }}>
{"165.000 ₫"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Tồn kho: "}
<strong style={{ color: "var(--color-ink-primary)" }}>
{"0"}
</strong>
</span>
</div>
</div>
</div>
<div style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
<div style={{ background: "radial-gradient(circle at 50% 40%,var(--color-surface-card),var(--color-danger-subtle))", display: "flex", justifyContent: "center", padding: "18px 0 10px", position: "relative" }}>
<img src={"/images/officer/art-4.svg"} alt={"BÁT TIÊN"} width={"170"} height={"170"} style={{ maxWidth: "100%" }} />
<span style={{ position: "absolute", left: "12px", top: "12px" }}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-success-subtle)", color: "var(--color-success)" }}>
{"Còn hàng"}
</span>
</span>
</div>
<div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
<strong style={{ fontSize: "16px" }}>
{"Chè Bát Tiên"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Hộp 100 g"}
</span>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "4px" }}>
<strong style={{ fontSize: "18px", color: "var(--color-primary)" }}>
{"210.000 ₫"}
</strong>
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Tồn kho: "}
<strong style={{ color: "var(--color-ink-primary)" }}>
{"21"}
</strong>
</span>
</div>
</div>
</div>
</div>
    </div>
  )
}
