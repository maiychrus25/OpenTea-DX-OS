// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { activitySentence, balanceSentence, carePlanSentence, priceSentence } from '@/lib/tts/sentences'

test('the price sentence lists each grade in Vietnamese words', () => {
  expect(priceSentence([{ grade_name: 'Loại 1', price_vnd_per_kg: 13000 }, { grade_name: 'Loại 2', price_vnd_per_kg: 9000 }]))
    .toBe('Giá thu mua hôm nay: Loại 1, 13.000 đồng một ki-lô-gam. Loại 2, 9.000 đồng một ki-lô-gam.')
  expect(priceSentence([])).toBe('Hôm nay HTX chưa công bố giá thu mua.')
})

test('a sprayed activity reminds the withdrawal days, other activities do not', () => {
  expect(activitySentence('Phun thuốc BVTV', true)).toBe('Hoạt động Phun thuốc BVTV. Nhớ ghi số ngày cách ly của thuốc.')
  expect(activitySentence('Bón phân', false)).toBe('Hoạt động Bón phân.')
})

test('a care plan without the officer advice says there is none yet', () => {
  expect(carePlanSentence('Đốm nâu', null)).toBe('Kế hoạch chăm sóc cho Đốm nâu. Chưa có hướng dẫn từ cán bộ kỹ thuật.')
  expect(carePlanSentence('Đốm nâu', ' Tỉa lá bệnh ')).toBe('Kế hoạch chăm sóc cho Đốm nâu. Tỉa lá bệnh')
})

test('the balance sentence reads the balance line only, with no digits beyond it', () => {
  expect(balanceSentence('HTX đang nợ bạn 250.000 đ')).toBe('Sổ tiền của bạn: HTX đang nợ bạn 250.000 đ.')
})
