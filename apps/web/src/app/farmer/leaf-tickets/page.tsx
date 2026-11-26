// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import styles from '@/components/features/farmer-web/kit.module.css'

export const metadata = { title: "Phiếu cân búp tươi" }

/** Laid out as designed. There is no data source yet: every figure and message here is fixed placeholder content. */
export default function FarmerLeafTicketsPage() {
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
{"Phiếu cân búp tươi"}
</h1>
<p className={[styles["sub"]].join(' ')}>
{"Các lần HTX cân chè búp tươi của hộ chị và tình hình chi trả"}
</p>
</div>
</div>
<div className={[styles["pn"]].join(' ')} style={{ display: "flex", gap: "14px", alignItems: "center", padding: "14px 18px" }}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)", width: "46px", height: "46px" }}>
<svg aria-hidden="true" width={"22"} height={"22"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10ZM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"}>
</path>
</svg>
</span>
<span style={{ flex: "1" }}>
<strong style={{ fontSize: "16px" }}>
{"Thu mua búp tươi"}
</strong>
<br  />
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Kỳ 2 tháng 11/2026 · chốt ngày 30/11"}
</span>
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--muted)", color: "var(--color-ink-tertiary)" }}>
{"Ứng dụng của HTX"}
</span>
</div>
<div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
<div className={[styles["pn"]].join(' ')} style={{ flex: "1 1 200px", padding: "16px" }}>
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"Đã cân kỳ này"}
</span>
<br  />
<strong style={{ fontSize: "26px" }}>
{"476,5 kg"}
</strong>
</div>
<div className={[styles["pn"]].join(' ')} style={{ flex: "1 1 200px", padding: "16px" }}>
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"Tạm tính"}
</span>
<br  />
<strong style={{ fontSize: "26px" }}>
{"5.478.000 đ"}
</strong>
</div>
<div className={[styles["pn"]].join(' ')} style={{ flex: "1 1 200px", padding: "16px" }}>
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"Chi trả kỳ trước"}
</span>
<br  />
<span style={{ display: "inline-block", marginTop: "6px" }}>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Đã chi trả 15/11"}
</span>
</span>
</div>
</div>
<section className={[styles["pn"]].join(' ')}>
<div className={[styles["ph"]].join(' ')}>
<span style={{ flex: "1" }}>
{"Phiếu cân của tôi"}
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)" }}>
{"Kỳ đang mở"}
</span>
</div>
<table style={{ borderCollapse: "collapse", width: "100%" }}>
<thead >
<tr >
<th className={[styles["th"]].join(' ')}>
{"Ngày cân"}
</th>
<th className={[styles["th"]].join(' ')}>
{"Thửa"}
</th>
<th className={[styles["th"]].join(' ')}>
{"Loại búp"}
</th>
<th className={[styles["th"]].join(' ')} style={{ textAlign: "right" }}>
{"Khối lượng"}
</th>
<th className={[styles["th"]].join(' ')} style={{ textAlign: "right" }}>
{"Đơn giá"}
</th>
<th className={[styles["th"]].join(' ')} style={{ textAlign: "right" }}>
{"Thành tiền"}
</th>
</tr>
</thead>
<tbody >
<tr >
<td className={[styles["td"], styles["mono"]].join(' ')}>
{"24/11"}
</td>
<td className={[styles["td"], styles["mono"]].join(' ')}>
{"T-013"}
</td>
<td className={[styles["td"]].join(' ')}>
{"Búp loại 1"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
{"128,5 kg"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
{"12.000 đ"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
<strong >
{"1.542.000 đ"}
</strong>
</td>
</tr>
<tr >
<td className={[styles["td"], styles["mono"]].join(' ')}>
{"21/11"}
</td>
<td className={[styles["td"], styles["mono"]].join(' ')}>
{"T-013"}
</td>
<td className={[styles["td"]].join(' ')}>
{"Búp loại 1"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
{"112,0 kg"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
{"12.000 đ"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
<strong >
{"1.344.000 đ"}
</strong>
</td>
</tr>
<tr >
<td className={[styles["td"], styles["mono"]].join(' ')}>
{"18/11"}
</td>
<td className={[styles["td"], styles["mono"]].join(' ')}>
{"T-013"}
</td>
<td className={[styles["td"]].join(' ')}>
{"Búp loại 2"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
{"96,0 kg"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
{"9.500 đ"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
<strong >
{"912.000 đ"}
</strong>
</td>
</tr>
<tr >
<td className={[styles["td"], styles["mono"]].join(' ')}>
{"14/11"}
</td>
<td className={[styles["td"], styles["mono"]].join(' ')}>
{"T-009"}
</td>
<td className={[styles["td"]].join(' ')}>
{"Búp loại 1"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
{"140,0 kg"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
{"12.000 đ"}
</td>
<td className={[styles["td"]].join(' ')} style={{ textAlign: "right" }}>
<strong >
{"1.680.000 đ"}
</strong>
</td>
</tr>
</tbody>
</table>
</section>
    </div>
  )
}
