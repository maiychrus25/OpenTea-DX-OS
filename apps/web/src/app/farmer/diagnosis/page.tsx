// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { getFarmerParcels, getDiagnosisHistory } from './actions'
import { DiagnosisClient } from './_components/DiagnosisClient'
import { redirect } from 'next/navigation'
import { CoreUnauthorizedError } from '@/domain/errors'

export const metadata = {
  title: 'Chẩn đoán bệnh | Nông dân',
}

export default async function DiagnosisPage() {
  try {
    const [parcels, history] = await Promise.all([
      getFarmerParcels(),
      getDiagnosisHistory()
    ])

    return (
      <DiagnosisClient initialParcels={parcels} initialHistory={history} />
    )
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error instanceof CoreUnauthorizedError) {
      redirect('/login')
    }
    return <div>Có lỗi xảy ra khi tải dữ liệu: {error.message}</div>
  }
}
