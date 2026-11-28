// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { activitySentence, balanceSentence, carePlanSentence, pickingSentence, priceSentence } from '@/lib/tts/sentences'

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

test('the picking sentence says per parcel whether the date is planned, blocked by withdrawal or missing', () => {
  expect(pickingSentence([
    { parcel_code: 'A1', date: '03/12/2026', withdrawal: true },
    { parcel_code: 'A2', date: '01/12/2026', withdrawal: false },
    { parcel_code: 'A3', date: null, withdrawal: false },
  ])).toBe('Thửa A1 đang cách ly, được hái sớm nhất ngày 03/12/2026. Thửa A2 dự kiến hái ngày 01/12/2026. Thửa A3 chưa có lịch hái.')
  expect(pickingSentence([])).toBe('Bạn chưa có thửa chè nào.')
})
