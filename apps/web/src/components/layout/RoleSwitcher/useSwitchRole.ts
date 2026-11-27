// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { HumanRole } from '@/lib/auth/roles'

export const SWITCH_FAILED_MESSAGE = 'Không chuyển được vai. Vui lòng thử lại.'

/** Asks the server to make `role` the active one, then opens that role's home. The server decides; this only calls it. */
export function useSwitchRole(onError: (message: string) => void) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const switchTo = useCallback(
    async (role: HumanRole) => {
      setPending(true)
      try {
        const response = await fetch('/api/session/role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        })
        const body = response.ok ? await response.json() : null
        if (!body?.data?.home) throw new Error('switch failed')
        router.replace(body.data.home)
        router.refresh()
      } catch {
        onError(SWITCH_FAILED_MESSAGE)
      } finally {
        setPending(false)
      }
    },
    [router, onError],
  )

  return { switchTo, pending }
}
