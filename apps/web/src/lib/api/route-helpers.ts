// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError } from '@/domain/errors'
import type { Tenant } from './tenant'

/** Throws 403 unless the active role is one of `roles`. */
export function requireRole(tenant: Tenant, ...roles: Tenant['role'][]): void {
  if (!roles.includes(tenant.role)) throw new ForbiddenError('Forbidden')
}

/** The dynamic segment of a route context, whether Next gives it as a promise or as a plain object. */
export async function paramOf(context: unknown, key = 'id'): Promise<string> {
  const params = await (context as { params: Promise<Record<string, string>> | Record<string, string> }).params
  return params[key]
}

export async function jsonBody(request: Request): Promise<unknown> {
  return request.json().catch(() => ({}))
}
