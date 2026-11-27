/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { buildPayloadSchema, fillPreview } from '@/application/agent/app-actions/app-action-schema'

const promotion = {
  type: 'object',
  required: ['product_id', 'discount_pct', 'days'],
  additionalProperties: false,
  properties: {
    product_id: { type: 'string', maxLength: 64 },
    discount_pct: { type: 'integer', minimum: 5, maximum: 30 },
    days: { type: 'integer', minimum: 1, maximum: 14 },
    kind: { type: 'string', enum: ['a', 'b'] },
    loud: { type: 'boolean' },
    ratio: { type: 'number', minimum: 0 },
  },
}

describe('buildPayloadSchema (C1 subset)', () => {
  const schema = buildPayloadSchema(promotion)
  const ok = { product_id: 'p1', discount_pct: 10, days: 7 }

  it('accepts a payload inside the schema, with optional fields and _labels', () => {
    expect(schema.safeParse(ok).success).toBe(true)
    expect(schema.safeParse({ ...ok, kind: 'a', loud: true, ratio: 0.5, _labels: { product_name: 'Chè' } }).success).toBe(true)
  })

  it.each([
    ['a missing required field', { product_id: 'p1', days: 7 }],
    ['a value above maximum', { ...ok, discount_pct: 31 }],
    ['a value below minimum', { ...ok, days: 0 }],
    ['a non-integer for an integer', { ...ok, days: 1.5 }],
    ['a string over maxLength', { ...ok, product_id: 'x'.repeat(65) }],
    ['a value outside enum', { ...ok, kind: 'c' }],
    ['an extra key', { ...ok, extra: 1 }],
    ['non-string labels', { ...ok, _labels: { a: 1 } }],
  ])('refuses %s', (_name, payload) => {
    expect(schema.safeParse(payload).success).toBe(false)
  })

  it('refuses a keyword outside the subset', () => {
    expect(() => buildPayloadSchema({ type: 'object', properties: { a: { type: 'string', pattern: '^a' } } })).toThrow()
    expect(() => buildPayloadSchema({ type: 'object', properties: { a: { type: 'array' } } })).toThrow()
  })
})

describe('fillPreview', () => {
  it('fills placeholders from the payload, then from the labels', () => {
    expect(
      fillPreview('Giảm {discount_pct}% cho {product_name} trong {days} ngày', { discount_pct: 10, days: 7 }, { product_name: 'Chè' })
    ).toBe('Giảm 10% cho Chè trong 7 ngày')
  })

  it('leaves no raw placeholder when a value is missing', () => {
    expect(fillPreview('Giảm {x}', {}, {})).toBe('Giảm …')
  })
})
