// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort } from '@/domain/farm/ports/ParcelPort';
import { prisma } from '@/infrastructure/db/prisma.client';

export class PrismaParcelRepository implements ParcelPort {
  async findById(id: string): Promise<{ centroid_lat: number | null; centroid_lng: number | null } | null> {
    const parcel = await prisma.parcel.findUnique({
      where: { id },
      select: {
        centroid_lat: true,
        centroid_lng: true,
        household: {
          select: {
            keycloak_user_id: true,
          }
        }
      },
    });
    return parcel;
  }
}
