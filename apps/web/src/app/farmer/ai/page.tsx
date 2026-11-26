// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import styles from '@/components/features/farmer-web/kit.module.css'

export const metadata = { title: "Hỏi đáp AI" }

/** Laid out as designed; there is no data source yet, so everything on it is sample content. */
export default function FarmerAiPage() {
  return (
    <div className={styles.page}>
      <p className={styles.sample} role="note">Dữ liệu mẫu: trợ lý AI chưa mở cho nông hộ, hội thoại dưới đây chỉ minh hoạ.</p>
<div className={[styles["hd"]].join(' ')}>
<span className={[styles["hico"]].join(' ')}>
<svg aria-hidden="true" width={"28"} height={"28"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M5 11h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM12 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 7v4M8 16h.01M16 16h.01"}>
</path>
</svg>
</span>
<div style={{ flex: "1 1 320px" }}>
<h1 className={[styles["h1"]].join(' ')}>
{"Hỏi đáp AI"}
</h1>
<p className={[styles["sub"]].join(' ')}>
{"Hỏi bất cứ điều gì về cây chè — AI trả lời dựa trên cẩm nang của HTX và quy trình VietGAP"}
</p>
</div>
<Link href={"/farmer/handbook"} className={[styles["btn2"]].join(' ')}>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"}>
</path>
</svg>
{"Mở cẩm nang"}
</Link>
<button type={"button"} className={[styles["btn"]].join(' ')} disabled>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 5v14M5 12h14"}>
</path>
</svg>
{"Cuộc hỏi mới"}
</button>
</div>
<div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
<section className={[styles["pn"]].join(' ')} style={{ flex: "3 1 560px", minWidth: "0", display: "flex", flexDirection: "column", minHeight: "720px" }}>
<div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px", borderBottom: "1px solid var(--color-border-row)" }}>
<span className={[styles["ico"]].join(' ')} style={{ width: "40px", height: "40px", background: "var(--sidebar-bg)", color: "var(--accent-lime)", borderRadius: "12px" }}>
<svg aria-hidden="true" width={"20"} height={"20"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 3v4M21 5h-4"}>
</path>
</svg>
</span>
<span style={{ flex: "1" }}>
<strong style={{ fontSize: "15px", color: "var(--color-ink-heading)" }}>
{"Trợ lý canh tác OpenTea"}
</strong>
<br  />
<span style={{ fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
{"Đang hỏi về "}
<strong style={{ color: "var(--color-primary)" }}>
{"T-012 · LDP1 · 0,6 ha"}
</strong>
</span>
</span>
<select className={[styles["inp"]].join(' ')} aria-label={"Chọn thửa"} style={{ height: "36px" }}>
<option >
{"T-012 · LDP1"}
</option>
<option >
{"T-013 · Kim Tuyên"}
</option>
<option >
{"Chung cả vườn"}
</option>
</select>
</div>
<div style={{ flex: "1", padding: "22px", display: "flex", flexDirection: "column", gap: "18px", background: "var(--color-surface-sunken)" }}>
<div style={{ display: "flex", gap: "10px", maxWidth: "82%" }}>
<span className={[styles["ico"]].join(' ')} style={{ width: "36px", height: "36px", background: "var(--sidebar-bg)", color: "var(--accent-lime)", borderRadius: "10px" }}>
<svg aria-hidden="true" width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 3v4M21 5h-4"}>
</path>
</svg>
</span>
<div style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-border)", borderRadius: "16px 16px 16px 4px", padding: "14px 16px", fontSize: "14px", lineHeight: "1.65" }}>
{"Chào chị Mai! Em là trợ lý canh tác. Chị cứ hỏi về bón phân, sâu bệnh, thu hái, hoặc gửi ảnh lá chè để em xem giúp nhé."}
</div>
</div>
<div style={{ alignSelf: "flex-end", maxWidth: "64%", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
<span style={{ width: "150px", height: "100px", borderRadius: "12px", background: "var(--color-primary-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "var(--color-ink-secondary)" }}>
{"[Ảnh lá chè]"}
</span>
<div style={{ background: "var(--color-primary)", color: "var(--color-surface-card)", borderRadius: "16px 16px 4px 16px", padding: "12px 16px", fontSize: "14px", lineHeight: "1.55" }}>
{"Lá chè nhà em có đốm nâu nhỏ, mép cháy. Phải làm sao? Hôm qua mới phun thuốc."}
</div>
</div>
<div style={{ display: "flex", gap: "10px", maxWidth: "84%" }}>
<span className={[styles["ico"]].join(' ')} style={{ width: "36px", height: "36px", background: "var(--sidebar-bg)", color: "var(--accent-lime)", borderRadius: "10px" }}>
<svg aria-hidden="true" width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 3v4M21 5h-4"}>
</path>
</svg>
</span>
<div style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-border)", borderRadius: "16px 16px 16px 4px", padding: "16px", fontSize: "14px", lineHeight: "1.65", display: "flex", flexDirection: "column", gap: "12px" }}>
<span >
{"Từ ảnh, nhiều khả năng là "}
<strong >
{"bệnh đốm nâu (thán thư)"}
</strong>
{" hoặc cháy lá do thuốc. Chị làm theo thứ tự:"}
</span>
<ol style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
<li >
{"Ngưng phun thêm, hái bỏ lá bệnh nặng và gom ra ngoài nương."}
</li>
<li >
{"Kiểm tra thời tiết 2 ngày tới: nếu ẩm, tránh bón đạm."}
</li>
<li >
{"Chụp thêm 2–3 lá khác nhau gửi vào mục "}
<Link href={"/farmer/diagnosis"} style={{ color: "var(--color-primary)", fontWeight: "700" }}>
{"Chẩn đoán"}
</Link>
{" để cán bộ xác nhận."}
</li>
</ol>
<div style={{ display: "flex", gap: "8px", alignItems: "center", background: "var(--color-warning-subtle)", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: "var(--color-warning)" }}>
<svg aria-hidden="true" width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"}>
</path>
</svg>
{"Thửa T-012 còn cách ly đến 01/12 — chưa hái trước ngày này."}
</div>
<div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "12.5px", color: "var(--color-ink-secondary)" }}>
<strong >
{"Nguồn:"}
</strong>
<Link href={"/farmer/handbook"} className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)", textDecoration: "none" }}>
{"Cẩm nang · Bệnh thán thư"}
</Link>
<Link href={"/farmer/handbook"} className={[styles["tag"]].join(' ')} style={{ background: "var(--color-primary-subtle)", color: "var(--color-primary)", textDecoration: "none" }}>
{"VietGAP · Thời gian cách ly"}
</Link>
</div>
<div style={{ display: "flex", flexWrap: "wrap", gap: "8px", borderTop: "1px solid var(--color-border-row)", paddingTop: "12px" }}>
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ height: "34px" }} disabled>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"}>
</path>
</svg>
{"Nghe đọc"}
</button>
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ height: "34px" }} disabled>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21a8 8 0 0 1 16 0"}>
</path>
</svg>
{"Hỏi cán bộ kỹ thuật"}
</button>
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ height: "34px" }} disabled>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8"}>
</path>
</svg>
{"Lưu vào nhật ký"}
</button>
</div>
</div>
</div>
<div style={{ display: "flex", gap: "10px", alignItems: "center", color: "var(--color-ink-secondary)", fontSize: "13px", marginLeft: "46px" }}>
{"Gợi ý tiếp:"}
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ height: "32px", fontSize: "13px" }} disabled>
{"Bao lâu thì khỏi?"}
</button>
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ height: "32px", fontSize: "13px" }} disabled>
{"Dùng chế phẩm sinh học được không?"}
</button>
</div>
</div>
<form style={{ display: "flex", gap: "10px", padding: "14px 18px", borderTop: "1px solid var(--color-border-row)", alignItems: "center" }}>
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Đính kèm ảnh"} style={{ width: "46px", height: "46px", padding: "0" }} disabled>
<svg aria-hidden="true" width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"}>
</path>
</svg>
</button>
<input aria-label={"Câu hỏi"} className={[styles["inp"]].join(' ')} placeholder={"Hỏi về bón phân, sâu bệnh, thu hái…"} style={{ flex: "1", height: "46px", minWidth: "0" }} />
<button type={"button"} className={[styles["btn2"]].join(' ')} aria-label={"Nói"} style={{ width: "46px", height: "46px", padding: "0" }} disabled>
<svg aria-hidden="true" width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3"}>
</path>
</svg>
</button>
<button type={"button"} className={[styles["btn"]].join(' ')} style={{ height: "46px" }} disabled>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M22 2 11 13M22 2l-7 20-4-9-9-4z"}>
</path>
</svg>
{"Gửi"}
</button>
</form>
</section>
<div style={{ flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
<section className={[styles["pn"]].join(' ')}>
<div className={[styles["ph"]].join(' ')}>
{"Hỏi nhanh"}
</div>
<div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ justifyContent: "flex-start", height: "44px", gap: "12px" }} disabled>
<span className={[styles["ico"]].join(' ')} style={{ width: "30px", height: "30px", borderRadius: "8px", background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"}>
</path>
</svg>
</span>
{"Bón phân thế nào cho vụ đông?"}
</button>
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ justifyContent: "flex-start", height: "44px", gap: "12px" }} disabled>
<span className={[styles["ico"]].join(' ')} style={{ width: "30px", height: "30px", borderRadius: "8px", background: "var(--color-warning-subtle)", color: "var(--color-accent)" }}>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"}>
</path>
</svg>
</span>
{"Sâu bệnh hay gặp tháng 12"}
</button>
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ justifyContent: "flex-start", height: "44px", gap: "12px" }} disabled>
<span className={[styles["ico"]].join(' ')} style={{ width: "30px", height: "30px", borderRadius: "8px", background: "var(--color-info-subtle)", color: "var(--color-info)" }}>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10ZM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"}>
</path>
</svg>
</span>
{"Khi nào hái búp là đẹp nhất?"}
</button>
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ justifyContent: "flex-start", height: "44px", gap: "12px" }} disabled>
<span className={[styles["ico"]].join(' ')} style={{ width: "30px", height: "30px", borderRadius: "8px", background: "var(--color-primary-subtle)", color: "var(--color-primary)" }}>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"}>
</path>
</svg>
</span>
{"Thuốc nào được dùng theo VietGAP?"}
</button>
<button type={"button"} className={[styles["btn2"]].join(' ')} style={{ justifyContent: "flex-start", height: "44px", gap: "12px" }} disabled>
<span className={[styles["ico"]].join(' ')} style={{ width: "30px", height: "30px", borderRadius: "8px", background: "var(--color-info-subtle)", color: "var(--color-info)" }}>
<svg aria-hidden="true" width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"}>
<path d={"M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M16 14v6M8 14v6M12 16v6"}>
</path>
</svg>
</span>
{"Mưa dông thì cần làm gì?"}
</button>
</div>
</section>
<section className={[styles["pn"]].join(' ')}>
<div className={[styles["ph"]].join(' ')}>
<span style={{ flex: "1" }}>
{"Đã hỏi gần đây"}
</span>
</div>
<ul style={{ listStyle: "none", margin: "0", padding: "0", fontSize: "13.5px" }}>
<li style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)" }}>
<strong >
{"Lá chè đốm nâu, mép cháy"}
</strong>
<br  />
<span style={{ color: "var(--color-ink-secondary)" }}>
{"Hôm nay · T-012"}
</span>
</li>
<li style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-border-row)" }}>
<strong >
{"Liều bón đạm đợt 2"}
</strong>
<br  />
<span style={{ color: "var(--color-ink-secondary)" }}>
{"23/11 · T-013"}
</span>
</li>
<li style={{ padding: "12px 18px" }}>
<strong >
{"Cắt tỉa sau thu hoạch"}
</strong>
<br  />
<span style={{ color: "var(--color-ink-secondary)" }}>
{"18/11 · chung"}
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
{"AI chỉ gợi ý. Việc phun thuốc, liều lượng và thời gian cách ly luôn do cán bộ kỹ thuật xác nhận."}
</span>
</div>
</div>
</div>
    </div>
  )
}
