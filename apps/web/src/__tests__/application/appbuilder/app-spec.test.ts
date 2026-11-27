/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { appSpecSchema, specPreviewLines } from '@/application/appbuilder/app-spec'

const validSpec = {
  app_id: 'gen-fertiliser-stock',
  name_vi: 'Kho phân bón',
  summary_vi: 'Theo dõi nhập xuất phân bón của hợp tác xã.',
  roles: [{ role: 'manager', can_vi: 'Xem tồn kho và ghi nhập xuất' }],
  screens: [{ path: '/', title_vi: 'Tồn kho', purpose_vi: 'Xem số lượng từng loại phân' }],
  data: [{ table: 'stock_items', fields: [{ name: 'kind', type: 'choice', label_vi: 'Loại', choices: ['NPK', 'Hữu cơ'] }] }],
  agent_reads: [{ name: 'low_stock', description_vi: 'Số loại phân sắp hết' }],
}

describe('the app spec (contract C2)', () => {
  it('accepts a well-formed spec', () => {
    expect(appSpecSchema.safeParse(validSpec).success).toBe(true)
  })

  it.each([
    ['an id without the gen- prefix', { app_id: 'fertiliser-stock' }],
    ['an id that is too short', { app_id: 'gen-ab' }],
    ['an id over 31 characters, the manifest cap', { app_id: `gen-${'a'.repeat(28)}` }],
    ['no roles', { roles: [] }],
    ['no screens', { screens: [] }],
    ['a screen path with capitals', { screens: [{ path: '/Kho', title_vi: 'a', purpose_vi: 'b' }] }],
    ['six data tables', { data: Array.from({ length: 6 }, (_, i) => ({ table: `tbl_${'a'.repeat(i + 1)}`, fields: validSpec.data[0].fields })) }],
    ['a choice field without choices', { data: [{ table: 'stock_items', fields: [{ name: 'kind', type: 'choice', label_vi: 'Loại' }] }] }],
    ['an unknown field type', { data: [{ table: 'stock_items', fields: [{ name: 'kind', type: 'blob', label_vi: 'Loại' }] }] }],
    ['an action list (H2: the spec has no place for actions)', { actions: [{ name: 'x' }] }],
  ])('refuses %s', (_label, change) => {
    expect(appSpecSchema.safeParse({ ...validSpec, ...change }).success).toBe(false)
  })

  it('accepts an id of exactly 31 characters', () => {
    expect(appSpecSchema.safeParse({ ...validSpec, app_id: `gen-${'a'.repeat(27)}` }).success).toBe(true)
  })

  it('previews the name, the screens, the data fields and the build time', () => {
    const lines = specPreviewLines(appSpecSchema.parse(validSpec))
    expect(lines[0]).toContain('Kho phân bón')
    expect(lines.join('\n')).toContain('Tồn kho')
    expect(lines.join('\n')).toContain('Loại')
    expect(lines.at(-1)).toBe('Xây mất khoảng 10–30 phút.')
  })
})
