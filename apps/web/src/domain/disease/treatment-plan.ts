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
]

const GENERAL = 'Đánh dấu khu vực có triệu chứng, hái bỏ lá hỏng và theo dõi xem có lan rộng không.'

export function isHealthy(disease: string): boolean {
  return /khoẻ|khỏe|healthy/i.test(disease)
}

export function treatmentPlan(disease: string, officerAdvice?: string | null): PlanStep[] {
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
