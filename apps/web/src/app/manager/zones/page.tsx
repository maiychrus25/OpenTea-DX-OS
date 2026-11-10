// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ListParcelsUseCase } from '@/application/farm/ListParcelsUseCase'
import { CoreGatewayClient } from '@/infrastructure/core/core-gateway.client'
import { GatewayParcelReader } from '@/infrastructure/core/gateway-parcel-reader'
import { MetricCard } from '@/components/ui/MetricCard'
import { Pill } from '@/components/ui/Pill'
import { Map } from 'lucide-react'
import styles from './page.module.css'

const ZoneMap = dynamic(() => import('@/components/features/map/ZoneMap'), { ssr: false })

export default async function ManagerZonesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/auth/login')
  }

  const role = (session.user as any).role
  if (role !== 'manager') {
    redirect('/unauthorized')
  }

  const useCase = new ListParcelsUseCase(new GatewayParcelReader(new CoreGatewayClient(role)))
  
  // Manager sees all parcels
  const parcels = await useCase.execute({}, role)

  // Aggregate total active area
  const activeParcels = parcels.filter(p => p.status === 'ACTIVE')
  const totalArea = activeParcels.reduce((sum, p) => sum + (p.area_ha || 0), 0)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Bản đồ Vùng Trồng</h1>
      </div>

      <MetricCard 
        icon={<Map size={24} />}
        label="Tổng diện tích đang canh tác (ha)" 
        value={totalArea.toFixed(2)} 
      />

      <div className={styles.mapWrapper}>
        <ZoneMap parcels={parcels} />
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Mã vùng</th>
              <th>Nông hộ</th>
              <th>Diện tích (ha)</th>
              <th>Cây trồng hiện tại</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {parcels.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center' }}>Không có dữ liệu vùng trồng.</td>
              </tr>
            ) : (
              parcels.map(parcel => (
                <tr key={parcel.id}>
                  <td>{parcel.parcel_code}</td>
                  <td>{parcel.household?.name || 'N/A'}</td>
                  <td>{parcel.area_ha}</td>
                  <td>{parcel.crop_type || 'Chưa có'}</td>
                  <td>
                    <Pill tone={parcel.status === 'ACTIVE' ? 'green' : 'neutral'}>
                      {parcel.status}
                    </Pill>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
