// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small drawings and photos shipped with the page */

import React from 'react'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: "Tour" }

/** Laid out as designed; there is no data source yet, so everything on it is sample content. */
export default function OfficerToursPage() {
  return (
    <div className={styles.page}>
<div className={[styles["hd"]].join(' ')}>
<span className={[styles["hico"]].join(' ')}>
<svg aria-hidden="true" width={"28"} height={"28"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"}>
</path>
</svg>
</span>
<div style={{ flex: "1 1 320px" }}>
<h1 className={[styles["h1"]].join(' ')}>
{"Tour của HTX"}
</h1>
<p className={[styles["sub"]].join(' ')}>
{"Các tour đã có khách đặt. Tour đủ điều kiện mới được đăng và mở đặt, nên không có bước duyệt."}
</p>
</div>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Chỉ xem (cán bộ)"}
</span>
</div>
<section style={{ position: "relative", height: "170px", borderRadius: "10px", overflow: "hidden", background: "var(--sidebar-bg)" }}>
<img src={"/images/officer/tea-mist.jpg"} alt={""} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% 40%" }} />
<div style={{ position: "absolute", inset: "0", background: "linear-gradient(90deg,color-mix(in srgb, var(--video-shade) 82%, transparent),color-mix(in srgb, var(--video-shade) 15%, transparent) 70%)" }}>
</div>
<div style={{ position: "absolute", left: "28px", right: "28px", top: "0", bottom: "0", display: "flex", flexDirection: "column", justifyContent: "center", gap: "16px" }}>
<strong style={{ color: "var(--color-surface-card)", fontSize: "22px", maxWidth: "520px", lineHeight: "1.3" }}>
{"Các đoàn sắp khởi hành"}
</strong>
<div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
<span style={{ background: "color-mix(in srgb, var(--color-ink-inverse) 18%, transparent)", border: "1px solid color-mix(in srgb, var(--color-ink-inverse) 35%, transparent)", borderRadius: "10px", padding: "10px 16px", color: "var(--color-surface-card)", display: "flex", flexDirection: "column", gap: "2px", backdropFilter: "blur(4px)" }}>
<span style={{ fontSize: "12px", opacity: ".85" }}>
{"Đoàn sắp khởi hành"}
</span>
<strong style={{ fontSize: "20px", whiteSpace: "nowrap" }}>
{"3"}
</strong>
</span>
<span style={{ background: "color-mix(in srgb, var(--color-ink-inverse) 18%, transparent)", border: "1px solid color-mix(in srgb, var(--color-ink-inverse) 35%, transparent)", borderRadius: "10px", padding: "10px 16px", color: "var(--color-surface-card)", display: "flex", flexDirection: "column", gap: "2px", backdropFilter: "blur(4px)" }}>
<span style={{ fontSize: "12px", opacity: ".85" }}>
{"Khách đã đặt"}
</span>
<strong style={{ fontSize: "20px", whiteSpace: "nowrap" }}>
{"11"}
</strong>
</span>
<span style={{ background: "color-mix(in srgb, var(--color-ink-inverse) 18%, transparent)", border: "1px solid color-mix(in srgb, var(--color-ink-inverse) 35%, transparent)", borderRadius: "10px", padding: "10px 16px", color: "var(--color-surface-card)", display: "flex", flexDirection: "column", gap: "2px", backdropFilter: "blur(4px)" }}>
<span style={{ fontSize: "12px", opacity: ".85" }}>
{"Gần nhất"}
</span>
<strong style={{ fontSize: "20px", whiteSpace: "nowrap" }}>
{"27/11/2026"}
</strong>
</span>
</div>
</div>
</section>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "18px" }}>
<div style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
<span style={{ position: "relative", display: "block" }}>
<span style={{ position: "relative", display: "block", height: "180px", overflow: "hidden", background: "var(--sidebar-bg)" }}>
<img src={"/images/officer/tea-mist.jpg"} alt={""} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "35% 35%", transform: "scale(1.4)", transformOrigin: "35% 35%" }} />
</span>
<span style={{ position: "absolute", left: "12px", top: "12px", background: "color-mix(in srgb, var(--color-ink-inverse) 94%, transparent)", borderRadius: "99px", padding: "5px 12px", fontSize: "12.5px", fontWeight: "700", color: "var(--color-primary)", whiteSpace: "nowrap", display: "flex", gap: "6px", alignItems: "center" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
{"Khởi hành 27/11/2026"}
</span>
<span style={{ position: "absolute", right: "12px", bottom: "12px", background: "var(--accent-lime)", color: "var(--sidebar-bg)", borderRadius: "10px", padding: "6px 12px", fontWeight: "800", fontSize: "15px", whiteSpace: "nowrap" }}>
{"290.000 ₫"}
</span>
</span>
<div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
<strong style={{ fontSize: "17px", lineHeight: "1.3" }}>
{"Thưởng trà trên đồi"}
</strong>
<div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px" }}>
<span style={{ color: "var(--color-ink-tertiary)" }}>
{"Đã đặt "}
<strong style={{ color: "var(--color-ink-primary)" }}>
{"2"}
</strong>
{" / 25 chỗ"}
</span>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"TB-0230"}
</span>
</div>
<span style={{ display: "block", height: "8px", borderRadius: "99px", background: "var(--color-border-row)", overflow: "hidden" }}>
<span style={{ display: "block", width: "8%", height: "100%", background: "var(--color-primary)", borderRadius: "99px" }}>
</span>
</span>
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
<span style={{ background: "var(--color-surface-sunken)", borderRadius: "10px", padding: "10px 12px" }}>
<span style={{ fontSize: "12px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Giá người lớn"}
</span>
<strong style={{ fontSize: "14.5px" }}>
{"290.000 ₫"}
</strong>
</span>
<span style={{ background: "var(--color-surface-sunken)", borderRadius: "10px", padding: "10px 12px" }}>
<span style={{ fontSize: "12px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Giá trẻ em"}
</span>
<strong style={{ fontSize: "14.5px" }}>
{"190.000 ₫"}
</strong>
</span>
</div>
</div>
</div>
<div style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
<span style={{ position: "relative", display: "block" }}>
<span style={{ position: "relative", display: "block", height: "180px", overflow: "hidden", background: "var(--sidebar-bg)" }}>
<img src={"/images/officer/tea-mist.jpg"} alt={""} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "85% 90%", transform: "scale(1.6)", transformOrigin: "85% 90%" }} />
</span>
<span style={{ position: "absolute", left: "12px", top: "12px", background: "color-mix(in srgb, var(--color-ink-inverse) 94%, transparent)", borderRadius: "99px", padding: "5px 12px", fontSize: "12.5px", fontWeight: "700", color: "var(--color-primary)", whiteSpace: "nowrap", display: "flex", gap: "6px", alignItems: "center" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
{"Khởi hành 28/11/2026"}
</span>
<span style={{ position: "absolute", right: "12px", bottom: "12px", background: "var(--accent-lime)", color: "var(--sidebar-bg)", borderRadius: "10px", padding: "6px 12px", fontWeight: "800", fontSize: "15px", whiteSpace: "nowrap" }}>
{"450.000 ₫"}
</span>
</span>
<div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
<strong style={{ fontSize: "17px", lineHeight: "1.3" }}>
{"Trải nghiệm hái chè Tân Cương"}
</strong>
<div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px" }}>
<span style={{ color: "var(--color-ink-tertiary)" }}>
{"Đã đặt "}
<strong style={{ color: "var(--color-ink-primary)" }}>
{"4"}
</strong>
{" / 20 chỗ"}
</span>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"TB-0231"}
</span>
</div>
<span style={{ display: "block", height: "8px", borderRadius: "99px", background: "var(--color-border-row)", overflow: "hidden" }}>
<span style={{ display: "block", width: "20%", height: "100%", background: "var(--color-primary)", borderRadius: "99px" }}>
</span>
</span>
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
<span style={{ background: "var(--color-surface-sunken)", borderRadius: "10px", padding: "10px 12px" }}>
<span style={{ fontSize: "12px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Giá người lớn"}
</span>
<strong style={{ fontSize: "14.5px" }}>
{"450.000 ₫"}
</strong>
</span>
<span style={{ background: "var(--color-surface-sunken)", borderRadius: "10px", padding: "10px 12px" }}>
<span style={{ fontSize: "12px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Giá trẻ em"}
</span>
<strong style={{ fontSize: "14.5px" }}>
{"300.000 ₫"}
</strong>
</span>
</div>
</div>
</div>
<div style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-border-input)", borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
<span style={{ position: "relative", display: "block" }}>
<span style={{ position: "relative", display: "block", height: "180px", overflow: "hidden", background: "var(--sidebar-bg)" }}>
<img src={"/images/officer/tea-sunrise.jpg"} alt={""} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 85%", transform: "scale(1.5)", transformOrigin: "50% 85%" }} />
</span>
<span style={{ position: "absolute", left: "12px", top: "12px", background: "color-mix(in srgb, var(--color-ink-inverse) 94%, transparent)", borderRadius: "99px", padding: "5px 12px", fontSize: "12.5px", fontWeight: "700", color: "var(--color-primary)", whiteSpace: "nowrap", display: "flex", gap: "6px", alignItems: "center" }}>
<svg aria-hidden="true" width={"14"} height={"14"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"}>
</path>
</svg>
{"Khởi hành 30/11/2026"}
</span>
<span style={{ position: "absolute", right: "12px", bottom: "12px", background: "var(--accent-lime)", color: "var(--sidebar-bg)", borderRadius: "10px", padding: "6px 12px", fontWeight: "800", fontSize: "15px", whiteSpace: "nowrap" }}>
{"380.000 ₫"}
</span>
</span>
<div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
<strong style={{ fontSize: "17px", lineHeight: "1.3" }}>
{"Một ngày làm người nông dân chè"}
</strong>
<div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px" }}>
<span style={{ color: "var(--color-ink-tertiary)" }}>
{"Đã đặt "}
<strong style={{ color: "var(--color-ink-primary)" }}>
{"5"}
</strong>
{" / 15 chỗ"}
</span>
<span className={[styles["mono"]].join(' ')} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"TB-0229"}
</span>
</div>
<span style={{ display: "block", height: "8px", borderRadius: "99px", background: "var(--color-border-row)", overflow: "hidden" }}>
<span style={{ display: "block", width: "33%", height: "100%", background: "var(--color-primary)", borderRadius: "99px" }}>
</span>
</span>
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
<span style={{ background: "var(--color-surface-sunken)", borderRadius: "10px", padding: "10px 12px" }}>
<span style={{ fontSize: "12px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Giá người lớn"}
</span>
<strong style={{ fontSize: "14.5px" }}>
{"380.000 ₫"}
</strong>
</span>
<span style={{ background: "var(--color-surface-sunken)", borderRadius: "10px", padding: "10px 12px" }}>
<span style={{ fontSize: "12px", color: "var(--color-ink-secondary)", display: "block" }}>
{"Giá trẻ em"}
</span>
<strong style={{ fontSize: "14.5px" }}>
{"250.000 ₫"}
</strong>
</span>
</div>
</div>
</div>
</div>
    </div>
  )
}
