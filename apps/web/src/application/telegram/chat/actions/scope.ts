// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NotFoundError } from '@/domain/errors'

/** A flow offers at most this many choices per step, newest first (plan C2). */
export const MAX_CHOICES = 8
export const NOT_FOUND_VI = 'Không tìm thấy mục này.'

/** The same answer for a missing record and for another cooperative's or household's record. */
export function notFound(): NotFoundError {
  return new NotFoundError(NOT_FOUND_VI)
}

/** Runs a tenant check and replaces its English "Resource not found" by the Vietnamese answer. */
export async function inCooperative(check: Promise<void>): Promise<void> {
  try {
    await check
  } catch (err) {
    throw err instanceof NotFoundError ? notFound() : err
  }
}

/** `dd/mm/yyyy` as a UTC midnight date, or null when it is not a real calendar day. */
export function parseVnDate(text: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null
}

/** The first `max` characters of a typed value, for a card line. */
export function clip(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
