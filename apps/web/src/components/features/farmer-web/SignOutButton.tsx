// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useTransition } from 'react'
import { LogOut } from 'lucide-react'
import { signOutAction } from '@/app/actions/signout-action'
import kit from './kit.module.css'

export function SignOutButton() {
  const [isPending, startTransition] = useTransition()
  return (
    <button type="button" className={kit.btn2} style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger-subtle)' }}
      disabled={isPending} onClick={() => startTransition(async () => { await signOutAction() })}>
      <LogOut size={16} aria-hidden="true" />
      {isPending ? 'Đang đăng xuất...' : 'Đăng xuất'}
    </button>
  )
}
