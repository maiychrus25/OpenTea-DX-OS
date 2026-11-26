// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import styles from '@/components/features/farmer-web/kit.module.css'

export const metadata = { title: "Cẩm nang canh tác" }

/** Laid out as designed. There is no data source yet: every figure and message here is fixed placeholder content. */
export default function FarmerHandbookPage() {
  return (
    <div className={styles.page}>
<div className={[styles["hd"]].join(' ')}>
<span className={[styles["hico"]].join(' ')}>
<svg aria-hidden="true" width={"28"} height={"28"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"}>
</path>
</svg>
</span>
<div style={{ flex: "1 1 320px" }}>
<h1 className={[styles["h1"]].join(' ')}>
{"Cẩm nang canh tác"}
</h1>
<p className={[styles["sub"]].join(' ')}>
{"Kỹ thuật trồng, chăm sóc, phòng trừ sâu bệnh và thu hái chè — biên soạn bởi cán bộ kỹ thuật HTX"}
</p>
</div>
<Link href={"/farmer/ai"} className={[styles["btn"]].join(' ')}>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 3v4M21 5h-4"}>
</path>
</svg>
{"Hỏi AI"}
</Link>
</div>
<form style={{ display: "flex", gap: "10px" }}>
<input aria-label={"Tìm trong cẩm nang"} className={[styles["inp"]].join(' ')} placeholder={"Tìm bài: rầy xanh, bón đạm, cắt tỉa…"} style={{ flex: "1", height: "48px", minWidth: "0", paddingLeft: "16px" }} />
<button type={"button"} className={[styles["btn"]].join(' ')} style={{ height: "48px" }} disabled>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5"}>
</path>
</svg>
{"Tìm"}
</button>
</form>
<section style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "14px" }} aria-label={"Chủ đề"}>
<Link href={"/farmer/handbook"} className={[styles["pn"]].join(' ')} style={{ padding: "16px", display: "flex", gap: "14px", alignItems: "center", textDecoration: "none", color: "inherit" }}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)", width: "48px", height: "48px" }}>
<svg aria-hidden="true" width={"24"} height={"24"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"}>
</path>
</svg>
</span>
<span >
<strong style={{ fontSize: "15px", color: "var(--color-ink-heading)" }}>
{"Trồng & chăm sóc"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"12 bài"}
</span>
</span>
</Link>
<Link href={"/farmer/handbook"} className={[styles["pn"]].join(' ')} style={{ padding: "16px", display: "flex", gap: "14px", alignItems: "center", textDecoration: "none", color: "inherit" }}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-info-subtle)", color: "var(--color-info)", width: "48px", height: "48px" }}>
<svg aria-hidden="true" width={"24"} height={"24"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"}>
</path>
</svg>
</span>
<span >
<strong style={{ fontSize: "15px", color: "var(--color-ink-heading)" }}>
{"Bón phân & tưới"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"15 bài"}
</span>
</span>
</Link>
<Link href={"/farmer/handbook"} className={[styles["pn"]].join(' ')} style={{ padding: "16px", display: "flex", gap: "14px", alignItems: "center", textDecoration: "none", color: "inherit" }}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)", width: "48px", height: "48px" }}>
<svg aria-hidden="true" width={"24"} height={"24"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"}>
</path>
</svg>
</span>
<span >
<strong style={{ fontSize: "15px", color: "var(--color-ink-heading)" }}>
{"Phòng trị bệnh"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"18 bài"}
</span>
</span>
</Link>
<Link href={"/farmer/handbook"} className={[styles["pn"]].join(' ')} style={{ padding: "16px", display: "flex", gap: "14px", alignItems: "center", textDecoration: "none", color: "inherit" }}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)", width: "48px", height: "48px" }}>
<svg aria-hidden="true" width={"24"} height={"24"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10ZM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"}>
</path>
</svg>
</span>
<span >
<strong style={{ fontSize: "15px", color: "var(--color-ink-heading)" }}>
{"Thu hái & sơ chế"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"10 bài"}
</span>
</span>
</Link>
<Link href={"/farmer/handbook"} className={[styles["pn"]].join(' ')} style={{ padding: "16px", display: "flex", gap: "14px", alignItems: "center", textDecoration: "none", color: "inherit" }}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-info-subtle)", color: "var(--color-info)", width: "48px", height: "48px" }}>
<svg aria-hidden="true" width={"24"} height={"24"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"}>
</path>
</svg>
</span>
<span >
<strong style={{ fontSize: "15px", color: "var(--color-ink-heading)" }}>
{"VietGAP & ghi chép"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"9 bài"}
</span>
</span>
</Link>
<Link href={"/farmer/handbook"} className={[styles["pn"]].join(' ')} style={{ padding: "16px", display: "flex", gap: "14px", alignItems: "center", textDecoration: "none", color: "inherit" }}>
<span className={[styles["ico"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)", width: "48px", height: "48px" }}>
<svg aria-hidden="true" width={"24"} height={"24"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M16 14v6M8 14v6M12 16v6"}>
</path>
</svg>
</span>
<span >
<strong style={{ fontSize: "15px", color: "var(--color-ink-heading)" }}>
{"Giống chè mới"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"7 bài"}
</span>
</span>
</Link>
</section>
<div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
<div style={{ flex: "3 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
<section className={[styles["pn"]].join(' ')}>
<div className={[styles["ph"]].join(' ')}>
<span style={{ flex: "1" }}>
{"Việc nên làm trong tháng 12"}
</span>
<span className={[styles["tag"], styles["ok"]].join(' ')}>
{"Theo mùa"}
</span>
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "0" }}>
<div style={{ padding: "16px 18px", borderRight: "1px solid var(--color-border-row)" }}>
<strong style={{ color: "var(--color-primary)", fontSize: "13px" }}>
{"ĐẦU THÁNG"}
</strong>
<p style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: "1.55" }}>
{"Thu hái lứa cuối, dọn cành lá bệnh khỏi nương."}
</p>
</div>
<div style={{ padding: "16px 18px", borderRight: "1px solid var(--color-border-row)" }}>
<strong style={{ color: "var(--color-primary)", fontSize: "13px" }}>
{"GIỮA THÁNG"}
</strong>
<p style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: "1.55" }}>
{"Bón lót phân hữu cơ, vun gốc giữ ẩm cho mùa khô."}
</p>
</div>
<div style={{ padding: "16px 18px" }}>
<strong style={{ color: "var(--color-primary)", fontSize: "13px" }}>
{"CUỐI THÁNG"}
</strong>
<p style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: "1.55" }}>
{"Đốn tỉa nhẹ, che chắn rét cho chè non."}
</p>
</div>
</div>
</section>
<section className={[styles["pn"]].join(' ')}>
<div className={[styles["ph"]].join(' ')}>
<span style={{ flex: "1" }}>
{"Bài viết nổi bật"}
</span>
<Link href={"/farmer/handbook"} style={{ fontSize: "13px", color: "var(--color-primary)", fontWeight: "600", textDecoration: "none" }}>
{"Xem tất cả"}
</Link>
</div>
<Link href={"/farmer/handbook"} style={{ display: "flex", gap: "14px", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-border-row)", textDecoration: "none", color: "inherit" }}>
<span style={{ width: "72px", height: "56px", borderRadius: "10px", background: "var(--color-primary-subtle)", flex: "none" }}>
</span>
<span style={{ flex: "1", minWidth: "0" }}>
<strong style={{ fontSize: "14.5px", color: "var(--color-ink-heading)" }}>
{"Bón phân cho chè vụ đông: lượng và thời điểm"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"Bón phân · đọc 6 phút"}
</span>
</span>
<span className={[styles["tag"], styles["ok"]].join(' ')}>
{"Mới"}
</span>
</Link>
<Link href={"/farmer/handbook"} style={{ display: "flex", gap: "14px", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-border-row)", textDecoration: "none", color: "inherit" }}>
<span style={{ width: "72px", height: "56px", borderRadius: "10px", background: "var(--color-primary-subtle)", flex: "none" }}>
</span>
<span style={{ flex: "1", minWidth: "0" }}>
<strong style={{ fontSize: "14.5px", color: "var(--color-ink-heading)" }}>
{"Nhận biết và xử lý rầy xanh theo hướng sinh học"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"Sâu bệnh · đọc 5 phút"}
</span>
</span>
</Link>
<Link href={"/farmer/handbook"} style={{ display: "flex", gap: "14px", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-border-row)", textDecoration: "none", color: "inherit" }}>
<span style={{ width: "72px", height: "56px", borderRadius: "10px", background: "var(--color-primary-subtle)", flex: "none" }}>
</span>
<span style={{ flex: "1", minWidth: "0" }}>
<strong style={{ fontSize: "14.5px", color: "var(--color-ink-heading)" }}>
{"Hái búp 1 tôm 2 lá: cách hái để cây ra búp đều"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"Thu hái · đọc 4 phút"}
</span>
</span>
<span className={[styles["tag"], styles["ok"]].join(' ')}>
{"Xem nhiều"}
</span>
</Link>
<Link href={"/farmer/handbook"} style={{ display: "flex", gap: "14px", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-border-row)", textDecoration: "none", color: "inherit" }}>
<span style={{ width: "72px", height: "56px", borderRadius: "10px", background: "var(--color-primary-subtle)", flex: "none" }}>
</span>
<span style={{ flex: "1", minWidth: "0" }}>
<strong style={{ fontSize: "14.5px", color: "var(--color-ink-heading)" }}>
{"Ghi nhật ký canh tác đạt chuẩn VietGAP"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"VietGAP · đọc 7 phút"}
</span>
</span>
</Link>
<Link href={"/farmer/handbook"} style={{ display: "flex", gap: "14px", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--color-border-row)", textDecoration: "none", color: "inherit" }}>
<span style={{ width: "72px", height: "56px", borderRadius: "10px", background: "var(--color-primary-subtle)", flex: "none" }}>
</span>
<span style={{ flex: "1", minWidth: "0" }}>
<strong style={{ fontSize: "14.5px", color: "var(--color-ink-heading)" }}>
{"Cắt tỉa, đốn chè sau thu hoạch cuối vụ"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"Chăm sóc · đọc 8 phút"}
</span>
</span>
</Link>
</section>
</div>
<div style={{ flex: "2 1 340px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
<section className={[styles["pn"]].join(' ')}>
<div className={[styles["ph"]].join(' ')}>
<span style={{ flex: "1" }}>
{"Nhận biết sâu bệnh"}
</span>
</div>
<Link href={"/farmer/handbook"} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", textDecoration: "none", color: "inherit" }}>
<span style={{ width: "52px", height: "52px", borderRadius: "12px", background: "var(--color-primary-subtle)", flex: "none" }}>
</span>
<span style={{ flex: "1" }}>
<strong style={{ fontSize: "14px" }}>
{"Rầy xanh"}
</strong>
<br  />
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Lá non quăn, mép cháy nâu"}
</span>
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)" }}>
{"Trung bình"}
</span>
</Link>
<Link href={"/farmer/handbook"} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", textDecoration: "none", color: "inherit" }}>
<span style={{ width: "52px", height: "52px", borderRadius: "12px", background: "var(--color-primary-subtle)", flex: "none" }}>
</span>
<span style={{ flex: "1" }}>
<strong style={{ fontSize: "14px" }}>
{"Bọ xít muỗi"}
</strong>
<br  />
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Búp có chấm đen, héo đầu"}
</span>
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-danger-subtle)", color: "var(--color-danger)" }}>
{"Cao"}
</span>
</Link>
<Link href={"/farmer/handbook"} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", textDecoration: "none", color: "inherit" }}>
<span style={{ width: "52px", height: "52px", borderRadius: "12px", background: "var(--color-primary-subtle)", flex: "none" }}>
</span>
<span style={{ flex: "1" }}>
<strong style={{ fontSize: "14px" }}>
{"Thán thư"}
</strong>
<br  />
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Đốm nâu tròn, viền vàng"}
</span>
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-warning-subtle)", color: "var(--color-accent)" }}>
{"Trung bình"}
</span>
</Link>
<Link href={"/farmer/handbook"} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)", textDecoration: "none", color: "inherit" }}>
<span style={{ width: "52px", height: "52px", borderRadius: "12px", background: "var(--color-primary-subtle)", flex: "none" }}>
</span>
<span style={{ flex: "1" }}>
<strong style={{ fontSize: "14px" }}>
{"Phồng lá chè"}
</strong>
<br  />
<span style={{ fontSize: "13px", color: "var(--color-ink-secondary)" }}>
{"Lá phồng, mặt dưới trắng"}
</span>
</span>
<span className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
{"Thấp"}
</span>
</Link>
<Link href={"/farmer/diagnosis"} className={[styles["btn2"]].join(' ')} style={{ margin: "14px 18px", display: "flex" }}>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"}>
</path>
</svg>
{"Chụp lá để chẩn đoán"}
</Link>
</section>
<section className={[styles["pn"]].join(' ')}>
<div className={[styles["ph"]].join(' ')}>
{"Tài liệu tải về"}
</div>
<ul style={{ listStyle: "none", margin: "0", padding: "0", fontSize: "13.5px" }}>
<li style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)" }}>
<svg aria-hidden="true" width={"20"} height={"20"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8"}>
</path>
</svg>
<span style={{ flex: "1" }}>
{"Quy trình VietGAP cho chè (PDF)"}
</span>
<svg aria-hidden="true" width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"}>
</path>
</svg>
</li>
<li style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px 18px" }}>
<svg aria-hidden="true" width={"20"} height={"20"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8"}>
</path>
</svg>
<span style={{ flex: "1" }}>
{"Bảng thuốc BVTV được phép 2026"}
</span>
<svg aria-hidden="true" width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"}>
</path>
</svg>
</li>
</ul>
</section>
</div>
</div>
    </div>
  )
}
