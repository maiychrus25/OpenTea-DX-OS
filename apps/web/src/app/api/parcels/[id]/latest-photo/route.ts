// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { prisma } from '@/infrastructure/db/prisma.client'
import { Client } from 'minio'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const parcelId = params.id

    // Find the latest disease report with a photo for this parcel
    // Since JournalEntry doesn't have photos in the current schema,
    // we use DiseaseReport photos as the "Ground Truth" Farm View.
    const report = await prisma.diseaseReport.findFirst({
      where: {
        parcel_id: parcelId
      },
      orderBy: {
        detection_date: 'desc'
      },
      select: {
        photo_minio_key: true,
        detection_date: true
      }
    })

    if (!report || !report.photo_minio_key) {
      return NextResponse.json({ photoUrl: null, date: null })
    }

    const minioClient = new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    })
    
    const bucketName = process.env.MINIO_BUCKET_NAME || 'agrimarket-private'

    // Generate pre-signed URL (60 mins expiry per rules-and-limits)
    const url = await minioClient.presignedGetObject(
      bucketName,
      report.photo_minio_key,
      3600
    )

    return NextResponse.json({ 
      photoUrl: url,
      date: report.detection_date
    })
  } catch (error) {
    console.error('[GET /api/parcels/[id]/latest-photo]', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
