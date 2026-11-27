// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Activities that carry no product, chemicals, dosage or withdrawal days. */
const WITHOUT_PRODUCT_FIELDS = ['HARVEST', 'PRUNING']

export const hasProductFields = (activityType: string) => !WITHOUT_PRODUCT_FIELDS.includes(activityType)

export const FRESH_LEAF_MAX_KG = 100000
export const FRESH_LEAF_REQUIRED_MESSAGE = 'Nhập sản lượng búp tươi (kg)'
const FRESH_LEAF_INVALID_MESSAGE = `Sản lượng búp tươi phải lớn hơn 0 và không quá ${FRESH_LEAF_MAX_KG} kg`

/** Error for the fresh leaf box, or null when the value is acceptable. */
export function freshLeafError(value: string, required: boolean): string | null {
  if (value.trim() === '') return required ? FRESH_LEAF_REQUIRED_MESSAGE : null
  const kg = Number(value)
  return Number.isFinite(kg) && kg > 0 && kg <= FRESH_LEAF_MAX_KG ? null : FRESH_LEAF_INVALID_MESSAGE
}

/** The fresh leaf weight to send; an empty box sends nothing. */
export const freshLeafKg = (value: string) => (value.trim() === '' ? undefined : Number(value))
