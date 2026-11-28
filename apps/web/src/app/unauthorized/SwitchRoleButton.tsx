// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ROLE_LABELS, type HumanRole } from '@/lib/auth/roles'
import { useSwitchRole } from '@/components/layout/RoleSwitcher/useSwitchRole'

export function SwitchRoleButton({ role }: { role: HumanRole }) {
  const [error, setError] = useState<string | null>(null)
  const { switchTo, pending } = useSwitchRole(setError)
  return (
    <>
      <Button variant="primary" isLoading={pending} onClick={() => switchTo(role)} data-testid="switch-role-btn">
        Chuyển sang vai {ROLE_LABELS[role]}
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  )
}
