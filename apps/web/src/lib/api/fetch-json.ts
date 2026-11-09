// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirectToLogin } from './redirect-to-login'

export const LOAD_FAILED_MESSAGE = 'Không thể tải dữ liệu. Vui lòng thử lại sau.'

/** Browser GET for a screen. A 401 leaves for login and never settles; any other failure rejects. */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (response.status === 401) {
    redirectToLogin()
    return new Promise<T>(() => undefined)
  }
  if (!response.ok) throw new Error(LOAD_FAILED_MESSAGE)
  return response.json()
}
