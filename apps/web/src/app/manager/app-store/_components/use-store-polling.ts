// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const POLL_MS = 3000

/**
 * While `working`, calls `poll` every 3 s; a failed poll keeps the last state and the next tick tries again.
 * The menu is rendered by the server layout, so it is refreshed once when the work in progress has ended.
 */
export function useStorePolling(working: boolean, poll: () => Promise<unknown>) {
  const router = useRouter()
  const latestPoll = useRef(poll)
  latestPoll.current = poll

  const wasWorking = useRef(false)
  useEffect(() => {
    if (wasWorking.current && !working) router.refresh()
    wasWorking.current = working
  }, [working, router])

  useEffect(() => {
    if (!working) return
    const timer = setInterval(() => {
      latestPoll.current().catch(() => undefined)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [working])
}
