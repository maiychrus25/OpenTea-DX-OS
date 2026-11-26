// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type MiniAppRole = 'farmer' | 'officer' | 'manager'

const HOME: Record<MiniAppRole, string> = {
  farmer: '/farmer/dashboard',
  officer: '/officer/dashboard',
  manager: '/manager/dashboard',
}

/** The web paths a chat button may open in the Mini App (C4): the journal forms, the parcel pages and the inbox. */
const ALLOWED: Record<MiniAppRole, readonly string[]> = {
  farmer: ['/farmer/journal/new'],
  officer: ['/officer/journal', '/officer/households', '/officer/farm-zones'],
  manager: ['/manager/ai', '/manager/journal-approve'],
}

/** `?to=` of /telegram/open: a same-origin path from the list for this role, or the role's home. */
export function miniAppTarget(role: MiniAppRole, to: string | null | undefined): string {
  if (!to || !/^\/[A-Za-z0-9/_\-?=&%.]*$/.test(to) || to.includes('//') || to.includes('..')) return HOME[role]
  const path = to.split('?')[0]
  return ALLOWED[role].some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ? to : HOME[role]
}
