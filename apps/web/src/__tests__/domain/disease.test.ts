// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { selectDiseaseModel } from '@/domain/disease/select-disease-model'
import { displayDiseaseName, UNCERTAIN_DISEASE_NAME } from '@/domain/disease/display-disease-name'

describe('selectDiseaseModel', () => {
  test.each(['Chè Trung du', 'CHÈ', 'Tea', 'Che shan tuyet', 'chè', 'Green tea', 'Chè_Shan', 'chè-tuyết'])('%s selects the tea model', (crop) => {
    expect(selectDiseaseModel(crop)).toBe('tea')
  })

  test.each(['Lúa', 'Rau', 'Lúa ST25', 'Cherry', 'Steak', '', '   ', 'Chế phẩm', 'Chẻ tre', 'Chê', 'CHẾ PHẨM'])('%j selects the general model', (crop) => {
    expect(selectDiseaseModel(crop)).toBe('general')
  })

  test.each([null, undefined])('%s selects the general model', (crop) => {
    expect(selectDiseaseModel(crop)).toBe('general')
  })
})

describe('displayDiseaseName', () => {
  test('prefers the confirmed name', () => {
    expect(displayDiseaseName({ confirmed_diagnosis: 'Đốm nâu', ai_disease_name: 'Thán thư' })).toBe('Đốm nâu')
  })

  test.each([null, '', '  '])('falls back to the AI name when the confirmed name is %j', (confirmed) => {
    expect(displayDiseaseName({ confirmed_diagnosis: confirmed, ai_disease_name: 'Thán thư' })).toBe('Thán thư')
  })

  test('the uncertain label is the Vietnamese "unknown"', () => {
    expect(UNCERTAIN_DISEASE_NAME).toBe('Không xác định')
  })
})
