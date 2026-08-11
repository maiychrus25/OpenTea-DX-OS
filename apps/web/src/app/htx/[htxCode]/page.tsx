import { prisma } from "@/infrastructure/db/prisma.client"
import Link from "next/link"
import CopyUrlButton from "@/components/copy-url-button"

interface PageProps {
    params: {
        htxCode: string
    }
}

const allowedStatuses = ["READY", "QR_EXPORTED"] as const

async function getHtxProfile(htxCode: string) {
    return prisma.htxProfile.findUnique({
        where: { htx_code: htxCode.toUpperCase() },
    })
}

async function getPublicLots(htxCode: string) {
    return prisma.lot.findMany({
        where: {
            status: { in: allowedStatuses as any },
            lot_code: { startsWith: `${htxCode.toUpperCase()}-` },
        },
        orderBy: {
            packaging_date: "desc",
        },
    })
}

export default async function HtxPage({ params }: PageProps) {
    const profile = await getHtxProfile(params.htxCode)
    const lots = await getPublicLots(params.htxCode)

    if (!profile) {
        return (
            <div style={{ padding: "20px" }}>
                <h1>HTX không tìm thấy</h1>
                <p>Xin kiểm tra lại mã HTX trong URL.</p>
            </div>
        )
    }

    return (
        <main style={{ padding: "24px", maxWidth: "1080px", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "24px" }}>
                <div>
                    <p style={{ margin: 0, color: "#6b7280" }}>HTX</p>
                    <h1 style={{ margin: "0.25rem 0" }}>{profile.name}</h1>
                    <p style={{ margin: "0.5rem 0" }}>{profile.address}</p>
                    {profile.contact_phone ? <p style={{ margin: "0.25rem 0" }}>Điện thoại: {profile.contact_phone}</p> : null}
                    {profile.contact_email ? <p style={{ margin: "0.25rem 0" }}>Email: {profile.contact_email}</p> : null}
                    {profile.season_label ? <p style={{ margin: "0.25rem 0" }}>Vụ mùa: {profile.season_label}</p> : null}
                </div>
                <CopyUrlButton />
            </div>

            <section style={{ marginBottom: "32px" }}>
                <h2>Lots công khai</h2>
                {lots.length === 0 ? (
                    <p>Hiện không có lot nào ở trạng thái READY hoặc QR_EXPORTED.</p>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "12px" }}>Mã lot</th>
                                    <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "12px" }}>Nông sản</th>
                                    <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "12px" }}>Ngày đóng gói</th>
                                    <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "12px" }}>Trọng lượng (kg)</th>
                                    <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "12px" }}>Phân loại</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lots.map((lot) => (
                                    <tr key={lot.id}>
                                        <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>
                                            <Link href={`/lot/${encodeURIComponent(lot.lot_code)}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                                                {lot.lot_code}
                                            </Link>
                                        </td>
                                        <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>{lot.commodity}</td>
                                        <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>
                                            {lot.packaging_date ? new Date(lot.packaging_date).toLocaleDateString("vi-VN") : "N/A"}
                                        </td>
                                        <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>{lot.total_weight_kg ?? "N/A"}</td>
                                        <td style={{ padding: "12px", borderBottom: "1px solid #e5e7eb" }}>{lot.quality_grade ?? "Chưa phân loại"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section style={{ padding: "20px", border: "1px solid #e5e7eb", borderRadius: "0.75rem", background: "#f9fafb" }}>
                <h2>Liên hệ mua hàng</h2>
                <p>Nếu bạn quan tâm tới sản phẩm, vui lòng liên hệ HTX qua:</p>
                <ul>
                    {profile.contact_phone ? <li>Điện thoại: {profile.contact_phone}</li> : null}
                    {profile.contact_email ? <li>Email: {profile.contact_email}</li> : null}
                </ul>
            </section>
        </main>
    )
}
