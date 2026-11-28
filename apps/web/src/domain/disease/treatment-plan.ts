// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/**
 * What to do after the AI names a disease on a tea leaf. Only care that needs no pesticide is suggested here:
 * the product, dose and timing are written by the technical officer, never by the AI.
 */
export interface PlanStep {
  when: string
  title: string
  detail: string
}

const FUNGAL = 'Hái hoặc cắt bỏ lá, búp bị bệnh, mang ra khỏi nương để tiêu huỷ. Giữ tán thông thoáng, thoát nước, không bón thừa đạm.'

/** Keyed by a word of the Vietnamese name the model returns (ai-models/tea_class_names_vi.json). */
const CARE: [RegExp, string][] = [
  [/bọ xít/i, 'Hái hết búp bị chích, mang ra khỏi nương. Phát quang bụi rậm, thăm nương lúc sáng sớm và chiều mát để theo dõi mật độ.'],
  [/tảo/i, 'Tỉa cành, giảm bóng rợp để tán khô nhanh; thoát nước tốt và bón phân cân đối.'],
  [/mắt chim|brown|chấm xám|đốm đỏ|đốm trắng/i, FUNGAL],
  // The four GĐ4-B targets, from the tea handbook (docs/templates/para-tea-cooperative/3-resources/tea-pests-and-diseases).
  [/rầy xanh/i, 'Hái kỹ búp bị hại, làm sạch cỏ và chăm nương cho cây khoẻ; không đốn quá sớm hoặc quá muộn. Theo dõi sát lúc chuyển mùa, khi mưa nắng xen kẽ.'],
  [/cánh tơ|bọ trĩ/i, 'Hái kỹ búp bị hại, làm sạch cỏ, tủ gốc giữ ẩm và xới đất quanh gốc để diệt nhộng; trồng cây che bóng.'],
  [/nhện/i, 'Giữ cây khoẻ và đủ ẩm: tưới phun trong mùa khô, giữ cây che bóng, bảo vệ thiên địch như bọ rùa.'],
  [/phồng lá/i, 'Hái bỏ búp, lá bị phồng và mang ra khỏi nương để tiêu huỷ; tỉa thưa cây che bóng cho nương thông thoáng, nhất là khi trời ẩm mát.'],
]

const GENERAL = 'Đánh dấu khu vực có triệu chứng, hái bỏ lá hỏng và theo dõi xem có lan rộng không.'

export function isHealthy(disease: string): boolean {
  return /khoẻ|khỏe|healthy/i.test(disease)
}

export function treatmentPlan(disease: string, officerAdvice?: string | null): PlanStep[] {
  if (/không phải lá chè|not_tea_leaf/i.test(disease)) {
    return [{ when: 'Ngay bây giờ', title: 'Chụp lại ảnh lá chè', detail: 'Ảnh này không giống lá chè. Chụp gần một lá hoặc búp có triệu chứng, đủ sáng và rõ nét, rồi chẩn đoán lại.' }]
  }
  if (isHealthy(disease)) {
    return [
      { when: 'Hôm nay', title: 'Chưa cần xử lý', detail: 'Không dùng thuốc. Tiếp tục chăm sóc và thăm nương như thường lệ.' },
      { when: 'Sau 7 ngày', title: 'Kiểm tra lại', detail: 'Nếu thấy lá khác thường, chụp ảnh để chẩn đoán lại.' },
    ]
  }
  const care = CARE.find(([word]) => word.test(disease))?.[1] ?? GENERAL
  return [
    { when: 'Hôm nay', title: 'Chăm sóc, chưa dùng thuốc', detail: care },
    { when: '1 - 2 ngày', title: 'Cán bộ kỹ thuật xác nhận bệnh', detail: 'Ảnh đã được gửi cho cán bộ. Kết quả AI có thể sai, nhất là khi ảnh mờ hoặc thiếu sáng.' },
    {
      when: 'Khi được duyệt',
      title: 'Thuốc, liều và thời điểm phun',
      detail: officerAdvice?.trim() || 'Chờ cán bộ kê thuốc trong danh mục được phép. Chưa tự mua và phun.',
    },
    { when: 'Ngay sau khi phun', title: 'Ghi nhật ký phun thuốc', detail: 'Nhập số ngày cách ly để hệ thống nhắc ngày được thu hái.' },
    { when: 'Sau 5 - 7 ngày', title: 'Chụp lại lá để kiểm tra', detail: 'Báo cán bộ nếu bệnh không giảm hoặc lan sang thửa khác.' },
  ]
}
