// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import styles from '@/components/features/farmer-web/kit.module.css'

export const metadata = { title: "Đăng ký vật tư" }

/** Laid out as designed. There is no data source yet: every figure and message here is fixed placeholder content. */
export default function FarmerSuppliesPage() {
  return (
    <div className={styles.page}>
<div className={[styles["hd"]].join(' ')}>
<span className={[styles["hico"]].join(' ')}>
<svg aria-hidden="true" width={"28"} height={"28"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10ZM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"}>
</path>
</svg>
</span>
<div style={{ flex: "1 1 320px" }}>
<h1 className={[styles["h1"]].join(' ')}>
{"Đăng ký vật tư"}
</h1>
<p className={[styles["sub"]].join(' ')}>
{"Đăng ký mua chung phân bón, thuốc BVTV — HTX tổng hợp theo hộ để lấy giá tốt"}
</p>
</div>
</div>
<div className={[styles["pn"]].join(' ')} style={{ display: "flex", gap: "14px", alignItems: "center", padding: "14px 18px" }}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)", width: "46px", height: "46px" }}>
<svg aria-hidden="true" width={"22"} height={"22"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M3 9l1.5-5h15L21 9M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8"}>
</path>
</svg>
</span>
<span style={{ flex: "1" }}>
<strong style={{ fontSize: "16px" }}>
{"Vật tư mua chung"}
</strong>
<br  />
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Đợt tháng 12 · mở đến hết 30/11/2026"}
</span>
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Ứng dụng của HTX"}
</span>
</div>
<div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
<section className={[styles["pn"]].join(' ')} style={{ flex: "3 1 520px", minWidth: "0" }}>
<div className={[styles["ph"]].join(' ')}>
<span style={{ flex: "1" }}>
{"Đợt mua chung tháng 12"}
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)" }}>
{"Còn 4 ngày"}
</span>
</div>
<table style={{ borderCollapse: "collapse", width: "100%" }}>
<thead >
<tr >
<th className={[styles["th"]].join(' ')}>
{"Vật tư"}
</th>
<th className={[styles["th"]].join(' ')}>
{"Đơn giá"}
</th>
<th className={[styles["th"]].join(' ')}>
{"Số lượng đăng ký"}
</th>
</tr>
</thead>
<tbody >
<tr >
<td className={[styles["td"]].join(' ')}>
<strong >
{"Phân NPK 16-16-8"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"bao 50 kg"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
{"520.000 đ"}
</td>
<td className={[styles["td"]].join(' ')}>
<span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Giảm"} style={{ width: "34px", height: "34px", padding: "0" }} disabled>
{"−"}
</button>
<strong className={[styles["mono"]].join(' ')} style={{ width: "22px", textAlign: "center" }}>
{"2"}
</strong>
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Tăng"} style={{ width: "34px", height: "34px", padding: "0" }} disabled>
{"+"}
</button>
</span>
</td>
</tr>
<tr >
<td className={[styles["td"]].join(' ')}>
<strong >
{"Phân hữu cơ vi sinh"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"bao 25 kg"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
{"210.000 đ"}
</td>
<td className={[styles["td"]].join(' ')}>
<span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Giảm"} style={{ width: "34px", height: "34px", padding: "0" }} disabled>
{"−"}
</button>
<strong className={[styles["mono"]].join(' ')} style={{ width: "22px", textAlign: "center" }}>
{"4"}
</strong>
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Tăng"} style={{ width: "34px", height: "34px", padding: "0" }} disabled>
{"+"}
</button>
</span>
</td>
</tr>
<tr >
<td className={[styles["td"]].join(' ')}>
<strong >
{"Chế phẩm sinh học Trichoderma"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"gói 1 kg"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
{"95.000 đ"}
</td>
<td className={[styles["td"]].join(' ')}>
<span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Giảm"} style={{ width: "34px", height: "34px", padding: "0" }} disabled>
{"−"}
</button>
<strong className={[styles["mono"]].join(' ')} style={{ width: "22px", textAlign: "center" }}>
{"1"}
</strong>
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Tăng"} style={{ width: "34px", height: "34px", padding: "0" }} disabled>
{"+"}
</button>
</span>
</td>
</tr>
<tr >
<td className={[styles["td"]].join(' ')}>
<strong >
{"Abamectin 1.8EC"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"chai 100 ml"}
</span>
</td>
<td className={[styles["td"]].join(' ')}>
{"68.000 đ"}
</td>
<td className={[styles["td"]].join(' ')}>
<span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Giảm"} style={{ width: "34px", height: "34px", padding: "0" }} disabled>
{"−"}
</button>
<strong className={[styles["mono"]].join(' ')} style={{ width: "22px", textAlign: "center" }}>
{"0"}
</strong>
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Tăng"} style={{ width: "34px", height: "34px", padding: "0" }} disabled>
{"+"}
</button>
</span>
</td>
</tr>
</tbody>
</table>
<div style={{ display: "flex", gap: "12px", alignItems: "center", padding: "16px 18px", borderTop: "1px solid var(--color-border-row)" }}>
<span style={{ flex: "1", fontSize: "14px" }}>
{"Tạm tính: "}
<strong style={{ fontSize: "18px" }}>
{"1.649.000 đ"}
</strong>
 
<span style={{ color: "var(--color-ink-secondary)" }}>
{"· thanh toán khi nhận hàng"}
</span>
</span>
<button type={"button"} className={[styles["btn"]].join(' ')} disabled>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M22 2 11 13M22 2l-7 20-4-9-9-4z"}>
</path>
</svg>
{"Gửi đăng ký"}
</button>
</div>
</section>
<div style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
<section className={[styles["pn"]].join(' ')}>
<div className={[styles["ph"]].join(' ')}>
{"Đăng ký của tôi"}
</div>
<ul style={{ listStyle: "none", margin: "0", padding: "0", fontSize: "13.5px" }}>
<li style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", display: "flex", gap: "10px" }}>
<span style={{ flex: "1" }}>
<strong >
{"Đợt tháng 11"}
</strong>
<br  />
<span style={{ color: "var(--color-ink-secondary)" }}>
{"3 loại · 1.120.000 đ"}
</span>
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Đã nhận"}
</span>
</li>
<li style={{ padding: "12px 18px", display: "flex", gap: "10px" }}>
<span style={{ flex: "1" }}>
<strong >
{"Đợt tháng 10"}
</strong>
<br  />
<span style={{ color: "var(--color-ink-secondary)" }}>
{"2 loại · 730.000 đ"}
</span>
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Đã nhận"}
</span>
</li>
</ul>
</section>
<div style={{ display: "flex", gap: "10px", background: "var(--color-info-subtle)", borderRadius: "14px", padding: "14px", fontSize: "13px", lineHeight: "1.55", color: "var(--color-info)" }}>
<svg aria-hidden="true" width={"20"} height={"20"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"}>
</path>
</svg>
<span >
{"Thuốc BVTV chỉ dùng theo hướng dẫn của cán bộ kỹ thuật và ghi vào nhật ký."}
</span>
</div>
</div>
</div>
    </div>
  )
}
