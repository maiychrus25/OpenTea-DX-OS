// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Pure and Edge-safe: the middleware imports this file.

/** Human roles in default-active priority order. Never add a role named `admin`: Hasura treats it as super-admin. */
export const HUMAN_ROLES = ['manager', 'officer', 'accountant', 'farmer', 'platform_admin'] as const
export type HumanRole = (typeof HUMAN_ROLES)[number]

export function isHumanRole(value: unknown): value is HumanRole {
  return typeof value === 'string' && (HUMAN_ROLES as readonly string[]).includes(value)
}

/** Every human role in Keycloak's realm_access.roles; service roles and unknown names are dropped. */
export function rolesFromRealmRoles(roles: unknown): HumanRole[] {
  if (!Array.isArray(roles)) return []
  return HUMAN_ROLES.filter((role) => roles.includes(role))
}

export function defaultActiveRole(roles: HumanRole[]): HumanRole | undefined {
  return HUMAN_ROLES.find((role) => roles.includes(role))
}

export function homeFor(role: HumanRole): string {
  return role === 'platform_admin' ? '/platform' : `/${role}/dashboard`
}

/** The roles a token or session holds. A cookie issued before multi-role support has only `role`. */
export function heldRoles(source: { role?: unknown; roles?: unknown }): HumanRole[] {
  if (Array.isArray(source.roles)) return source.roles.filter(isHumanRole)
  return isHumanRole(source.role) ? [source.role] : []
}

/** The active role when it is held, otherwise the default one. */
export function validActiveRole(active: unknown, roles: HumanRole[]): HumanRole | undefined {
  return isHumanRole(active) && roles.includes(active) ? active : defaultActiveRole(roles)
}

export const ROLE_LABELS: Record<HumanRole, string> = {
  manager: 'Trưởng HTX',
  officer: 'Cán bộ KT',
  accountant: 'Kế toán',
  farmer: 'Nông dân',
  platform_admin: 'Quản trị nền tảng',
}
