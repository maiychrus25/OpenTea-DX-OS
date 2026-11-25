// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'

// The agent only sends a template id and typed slots; the web renders the Vietnamese copy (spec §6, test 32).

export type NotificationAudience = 'internal' | 'households'

export interface TemplatePayload {
  template: string
  slots: Record<string, unknown>
  subjects: string[]
  note_vi?: string
}

export interface RenderedNotification {
  title: string
  body: string
}

// Mirrors the `vi` labels of ai-models/tea_class_names_vi.json (healthy is never a template slot).
const DISEASE_LABEL_VI = {
  algal_leaf_spot: 'Bệnh đốm tảo',
  birds_eye_spot: 'Bệnh đốm mắt chim (bird\'s eye spot)',
  brown_blight: 'Brown blight',
  gray_blight: 'Bệnh chấm xám',
  helopeltis: 'Bọ xít muỗi',
  red_leaf_spot: 'Bệnh đốm đỏ (red leaf spot)',
  white_spot: 'Bệnh đốm trắng (white spot)',
} as const

const SENSOR_LABEL_VI = {
  soil_moisture: 'độ ẩm đất',
  soil_temperature: 'nhiệt độ đất',
  air_temperature: 'nhiệt độ không khí',
  air_humidity: 'độ ẩm không khí',
  rainfall: 'lượng mưa',
} as const

const PARCEL_CODE = /^[A-Z0-9][A-Z0-9-]{0,31}$/

const parcelCode = z.string().regex(PARCEL_CODE)
// Sorted and unique in code point order, so one set of slots has one rendering.
const parcelCodes = z
  .array(parcelCode)
  .min(1)
  .max(20)
  .refine((codes) => codes.every((code, i) => i === 0 || codes[i - 1] < code), 'sorted and unique')
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'a real calendar date')
const intRange = (min: number, max: number) => z.number().int().min(min).max(max)
const sensorSlot = z.enum(Object.keys(SENSOR_LABEL_VI) as [keyof typeof SENSOR_LABEL_VI, ...(keyof typeof SENSOR_LABEL_VI)[]])
const diseaseSlot = z.enum(Object.keys(DISEASE_LABEL_VI) as [keyof typeof DISEASE_LABEL_VI, ...(keyof typeof DISEASE_LABEL_VI)[]])

const codesText = (codes: string[]) => codes.join(', ')

interface Template {
  audience: NotificationAudience
  slots: z.ZodTypeAny
  render(slots: any): RenderedNotification
}

const TEMPLATES: Record<string, Template> = {
  sensor_silent: {
    audience: 'internal',
    slots: z.object({ parcel_code: parcelCode, sensor: sensorSlot, hours: intRange(6, 720) }).strict(),
    render: (s) => ({
      title: 'Cảm biến không gửi số đo',
      body: `Cảm biến ${SENSOR_LABEL_VI[s.sensor as keyof typeof SENSOR_LABEL_VI]} ở thửa ${s.parcel_code} không gửi số đo ${s.hours} giờ. Cần kiểm tra pin hoặc kết nối.`,
    }),
  },
  dry_soil: {
    audience: 'households',
    slots: z.object({ parcel_codes: parcelCodes, value_pct: intRange(0, 100), threshold_pct: intRange(0, 100) }).strict(),
    render: (s) => ({
      title: 'Đất khô',
      body: `Đất ở thửa ${codesText(s.parcel_codes)} đang khô: độ ẩm ${s.value_pct}% dưới ngưỡng ${s.threshold_pct}%. Nên tưới giữ ẩm cho chè.`,
    }),
  },
  heat: {
    audience: 'households',
    slots: z.object({ parcel_codes: parcelCodes, value_c: intRange(-10, 60) }).strict(),
    render: (s) => ({
      title: 'Nắng nóng',
      body: `Nhiệt độ ở thửa ${codesText(s.parcel_codes)} lên ${s.value_c}°C. Nên hái chè sớm trước 9 giờ và che nắng cho búp non.`,
    }),
  },
  frost: {
    audience: 'households',
    slots: z.object({ parcel_codes: parcelCodes, value_c: intRange(-10, 60) }).strict(),
    render: (s) => ({
      title: 'Nguy cơ sương muối',
      body: `Nhiệt độ ở thửa ${codesText(s.parcel_codes)} xuống ${s.value_c}°C, có nguy cơ sương muối. Nên phủ gốc và tưới phun giữ ấm cho chè.`,
    }),
  },
  rain_after_spray: {
    audience: 'households',
    slots: z.object({ parcel_codes: parcelCodes, date: isoDate, rain_mm: intRange(1, 500) }).strict(),
    render: (s) => {
      const [year, month, day] = String(s.date).split('-')
      return {
        title: 'Mưa sau khi phun thuốc',
        body: `Dự báo mưa khoảng ${s.rain_mm} mm ngày ${day}/${month}/${year} ở thửa ${codesText(s.parcel_codes)}, ngay sau lần phun thuốc gần đây. Thuốc có thể bị rửa trôi: hỏi cán bộ trước khi phun lại.`,
      }
    },
  },
  disease_nearby: {
    audience: 'households',
    slots: z
      .object({ disease: diseaseSlot, parcel_codes: parcelCodes, count: intRange(2, 500), days: intRange(1, 30) })
      .strict(),
    render: (s) => ({
      title: 'Cảnh báo dịch bệnh',
      body: `Có ${s.count} báo cáo ${DISEASE_LABEL_VI[s.disease as keyof typeof DISEASE_LABEL_VI]} trong ${s.days} ngày qua ở các thửa ${codesText(s.parcel_codes)}. Kiểm tra lá chè và báo cán bộ nếu thấy dấu hiệu bệnh.`,
    }),
  },
}

const subjects = z.array(z.string().min(1).max(200)).min(1).max(20)
const noteVi = z.string().max(500).optional()

/** Payload of a notification kind: one strict object per template of the audience, nothing else accepted. */
export function templatePayloadSchema(audience: NotificationAudience): z.ZodType<TemplatePayload, z.ZodTypeDef, unknown> {
  const options = Object.entries(TEMPLATES)
    .filter(([, template]) => template.audience === audience)
    .map(([id, template]) =>
      z
        .object({ template: z.literal(id), slots: template.slots, subjects, note_vi: noteVi })
        .strict()
    )
  return z.union(options as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]) as z.ZodType<TemplatePayload, z.ZodTypeDef, unknown>
}

/** Title and body of a template. A human note, when given, is appended as a new paragraph. */
export function renderNotification(template: string, slots: Record<string, unknown>, noteVi?: string | null): RenderedNotification {
  const rendered = TEMPLATES[template].render(slots)
  const note = noteVi?.trim()
  return note ? { title: rendered.title, body: `${rendered.body}\n\n${note}` } : rendered
}
