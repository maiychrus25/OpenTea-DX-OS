// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/**
 * Example findings of a camera watch. The cooperative has no cameras and no such feed yet: nothing here
 * comes from the system, and no one must spray because of it. Screens that show it carry the "Mẫu" tag.
 */
export const CAMERAS = [
  { id: 1, image: '/images/diagnosis/cam1.jpg', place: 'P-TC-001 · Ô C1', time: '26/11, 06:38' },
  { id: 2, image: '/images/diagnosis/cam2.jpg', place: 'P-TC-001 · Ô B2', time: '26/11, 06:40', alert: true },
  { id: 3, image: '/images/diagnosis/cam3.jpg', place: 'P-TC-002 · Ô A3', time: '27/11, 07:10' },
  { id: 4, image: '/images/diagnosis/cam4.jpg', place: 'P-TC-002 · Ô B3', time: '27/11, 07:12' },
]

export type Tone = 'soft' | 'wt' | 'bd'

export interface Detection {
  id: string
  name: string
  place: string
  time: string
  level: string
  levelTone: Tone
  confidence: number
  status: string
  statusTone: Tone
  /** Whether someone still has to act on it. */
  open: boolean
  image: string
  photo: string
  symptom: string
  area: string
  camera: number
  advice: [string, string][]
  steps: { title: string; text: string; state: 'done' | 'now' | 'next' }[]
}

export const DETECTIONS: Detection[] = [
  {
    id: 'PH-2611-014', name: 'Bọ xít muỗi', place: 'P-TC-001 · Ô B2', time: '26/11, 06:40', level: 'Cao', levelTone: 'bd', confidence: 92,
    status: 'Đã duyệt phun', statusTone: 'soft', open: true, image: '/images/diagnosis/bo-xit-nho.jpg', photo: '/images/diagnosis/bo-xit.jpg',
    symptom: 'Búp có chấm đen, héo đầu', area: '≈ 120 m² (12%)', camera: 2,
    advice: [['Thuốc và liều', 'Theo chỉ định của cán bộ kỹ thuật'], ['Phạm vi', 'Ô B2 và các ô lân cận B1, B3'], ['Thời điểm', 'Sáng sớm, trời khô ráo'], ['Thời gian cách ly', 'Theo nhãn thuốc được chỉ định']],
    steps: [
      { title: 'AI phát hiện', text: '26/11, 06:40 · Camera 02', state: 'done' },
      { title: 'Cán bộ xác nhận bệnh', text: '26/11, 08:15 · Cán bộ kỹ thuật', state: 'done' },
      { title: 'Phê duyệt phun thuốc', text: '26/11, 08:20', state: 'done' },
      { title: 'Nông dân thực hiện phun', text: '27/11, 06:30 · ghi nhật ký phun', state: 'done' },
      { title: 'Cách ly, không thu hái', text: 'đến 04/12/2026', state: 'now' },
      { title: 'AI kiểm tra lại sau phun', text: 'dự kiến 30/11', state: 'next' },
    ],
  },
  {
    id: 'PH-2711-015', name: 'Rầy xanh', place: 'P-TC-002 · Ô A3', time: '27/11, 07:10', level: 'Trung bình', levelTone: 'wt', confidence: 81,
    status: 'Chờ cán bộ xác nhận', statusTone: 'wt', open: true, image: '/images/diagnosis/ray-xanh.jpg', photo: '/images/diagnosis/ray-xanh.jpg',
    symptom: 'Lá non quăn, mép cháy nâu', area: '≈ 60 m² (4%)', camera: 3, advice: [],
    steps: [
      { title: 'AI phát hiện', text: '27/11, 07:10 · Camera 03', state: 'done' },
      { title: 'Cán bộ xác nhận bệnh', text: 'đang chờ', state: 'now' },
    ],
  },
  {
    id: 'PH-2411-009', name: 'Phồng lá chè', place: 'P-TC-001 · Ô C1', time: '24/11, 16:05', level: 'Thấp', levelTone: 'soft', confidence: 74,
    status: 'Theo dõi, chưa cần phun', statusTone: 'soft', open: false, image: '/images/diagnosis/phong-la.jpg', photo: '/images/diagnosis/phong-la.jpg',
    symptom: 'Lá phồng, mặt dưới trắng', area: '≈ 20 m² (2%)', camera: 1, advice: [],
    steps: [
      { title: 'AI phát hiện', text: '24/11, 16:05 · Camera 01', state: 'done' },
      { title: 'Cán bộ xác nhận bệnh', text: 'theo dõi thêm, chưa cần phun', state: 'done' },
    ],
  },
]
