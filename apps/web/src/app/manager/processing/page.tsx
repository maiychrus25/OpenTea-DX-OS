// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { HeadProcessing } from './_components/HeadProcessing'
import { ForecastBlock } from '@/components/features/forecast/ForecastBlock'
import { forecastForHtx } from '@/lib/forecast/forecast-page'

export default async function ManagerProcessingPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') redirect('/login')
  const forecast = await forecastForHtx(session.user.htxCode)

  return <HeadProcessing forecast={<ForecastBlock forecast={forecast} />} />
}
