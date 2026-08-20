// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { HouseholdManager } from './_components/HouseholdManager'

export default async function OfficerHouseholdsPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') {
    redirect('/login')
  }

  return <HouseholdManager />
}
