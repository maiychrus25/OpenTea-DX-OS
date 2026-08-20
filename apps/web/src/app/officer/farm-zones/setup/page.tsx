// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SetupWizard } from './_components/setup-wizard'

export default async function FarmZoneSetupPage() {
  const session = await auth()
  
  // Officer check (optional/standard for this project)
  if (!session || session.user?.role !== 'officer') {
    redirect('/login')
  }

  return <SetupWizard />
}
