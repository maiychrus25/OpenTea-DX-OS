// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CoreUnauthorizedError, CoreUnavailableError } from '@/domain/errors'
import { getCoreToken } from '@/lib/auth/core-token'

const TIMEOUT_MS = 10_000

/** Hasura renders `timestamp` columns with no zone; they hold UTC, which is how Prisma reads them. */
export function parseCoreTimestamp(value: string): Date {
  return new Date(/(Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`)
}

/** Server-only: runs GraphQL against Hasura through the gateway, as the signed-in user. */
export class CoreGatewayClient {
  constructor(
    private readonly role: string,
    private readonly getToken: () => Promise<string> = getCoreToken,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)
  ) {}

  async graphql<T>(query: string, variables?: object): Promise<T> {
    const token = await this.getToken()

    let response: Response
    try {
      response = await this.fetchImpl(`${process.env.CORE_GATEWAY_URL}/api/data/graphql`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-hasura-role': this.role,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        // Next.js caches fetch in server components, which would serve one user's rows to another.
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new CoreUnavailableError()
    }

    if (response.status === 401) throw new CoreUnauthorizedError()
    if (!response.ok) throw new CoreUnavailableError()

    const body = (await response.json().catch(() => null)) as { data?: T; errors?: unknown[] } | null
    if (!body?.data || body.errors?.length) throw new CoreUnavailableError()
    return body.data
  }
}
