// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use server'

import { auth } from '@/auth'
import { CoreGatewayClient } from '@/infrastructure/core/core-gateway.client'
import { GatewayDiseaseReportReader } from '@/infrastructure/core/gateway-disease-report-reader'
import { GatewayParcelReader } from '@/infrastructure/core/gateway-parcel-reader'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'

export async function getFarmerParcels() {
  const session = await auth()
  if (!session || !session.user || session.user.role !== 'farmer') {
    throw new Error('Unauthorized')
  }

  const parcelRepo = new GatewayParcelReader(new CoreGatewayClient(session.user.role))
  // We need to fetch parcels for this household
  // The reader's findAll supports filtering by household_id, but we need the household_id first.
  // Wait, I can just use prisma directly here to avoid extra boilerplate if ParcelPort lacks findHouseholdIdByUserId.
  // Let's import prisma and get it.
  const { prisma } = await import('@/infrastructure/db/prisma.client')
  
  const household = await prisma.household.findFirst({
    where: { keycloak_user_id: session.user.id }
  })

  if (!household) {
    return []
  }

  const parcels = await parcelRepo.findAll({ household_id: household.id })
  
  return parcels.map(p => ({
    id: p.id,
    parcel_code: p.parcel_code,
    name: p.name || p.parcel_code,
  }))
}

export async function getDiagnosisHistory() {
  const session = await auth()
  if (!session || !session.user || session.user.role !== 'farmer') {
    throw new Error('Unauthorized')
  }

  const reportRepo = new GatewayDiseaseReportReader(new CoreGatewayClient(session.user.role))
  const storageAdapter = new MinioStorageAdapter()
  
  const history = await reportRepo.findHistoryByFarmer(session.user.id!)
  
  // Re-generate pre-signed URLs to ensure they are fresh
  const processedHistory = await Promise.all(history.map(async (item) => {
    try {
      const url = await storageAdapter.getPresignedUrl(item.photo_minio_key)
      return {
        ...item,
        photo_url: url
      }
    } catch (e) {
      // fallback to a placeholder or empty if minio fails
      return {
        ...item,
        photo_url: ''
      }
    }
  }))
  
  return processedHistory
}
