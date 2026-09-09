// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository';

export async function GET() {
  const session = await auth();
  if (!session || !session.user || session.user.role !== 'officer') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only officers can view pending reports' } },
      { status: 403 }
    );
  }

  try {
    const repository = new PrismaDiseaseReportRepository();
    let reports = await repository.findPendingReports();

    // Regenerate fresh presigned URLs for photos since they expire
    const { MinioStorageAdapter } = await import('@/infrastructure/storage/minio-storage.adapter');
    const storageAdapter = new MinioStorageAdapter();
    
    reports = await Promise.all(reports.map(async (r) => {
      if (r.photo_minio_key) {
        try {
          r.photo_url = await storageAdapter.getPresignedUrl(r.photo_minio_key);
        } catch (e) {
          console.error('Failed to generate presigned URL for', r.photo_minio_key, e);
        }
      }
      return r;
    }));

    return NextResponse.json({ data: reports });
  } catch (error) {
    console.error('[Officer Disease Reports API]', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch pending reports' } },
      { status: 500 }
    );
  }
}
