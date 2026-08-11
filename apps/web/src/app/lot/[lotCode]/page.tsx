import { prisma } from "@/infrastructure/db/prisma.client"

interface PageProps {
    params: {
        lotCode: string
    }
}

export default async function LotPage({ params }: PageProps) {
    const lot = await prisma.lot.findUnique({
        where: { lot_code: params.lotCode },
    })

    if (!lot) {
        return (
            <div style={{ padding: "24px" }}>
                <h1>Lot không tìm thấy</h1>
                <p>Xin kiểm tra lại mã lot hoặc quét lại QR.</p>
            </div>
        )
    }

    return (
        <main style={{ padding: "24px", maxWidth: "720px", margin: "0 auto" }}>
            <h1>Chi tiết Lot</h1>
            <div style={{ marginTop: "20px", padding: "20px", border: "1px solid #e5e7eb", borderRadius: "0.75rem", background: "#f9fafb" }}>
                <p><strong>Mã lot:</strong> {lot.lot_code}</p>
                <p><strong>Nông sản:</strong> {lot.commodity}</p>
                <p><strong>Trạng thái:</strong> {lot.status}</p>
                <p><strong>Ngày đóng gói:</strong> {lot.packaging_date ? new Date(lot.packaging_date).toLocaleDateString("vi-VN") : "N/A"}</p>
                <p><strong>Trọng lượng:</strong> {lot.total_weight_kg ?? "N/A"} kg</p>
                <p><strong>Phân loại:</strong> {lot.quality_grade ?? "Chưa phân loại"}</p>
            </div>
        </main>
    )
}
