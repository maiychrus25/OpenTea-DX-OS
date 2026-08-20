// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort } from '@/domain/farm/ports/ParcelPort';
import { prisma } from '@/infrastructure/db/prisma.client';

export class PrismaParcelRepository implements ParcelPort {
  async findById(id: string): Promise<{ centroid_lat: number | null; centroid_lng: number | null; parcel_code: string; household_id: string; household?: { id: string; name: string; keycloak_user_id: string | null } | null } | null> {
    const parcel = await prisma.parcel.findUnique({
      where: { id },
      select: {
        centroid_lat: true,
        centroid_lng: true,
        parcel_code: true,
        household_id: true,
        household: {
          select: {
            id: true,
            name: true,
            keycloak_user_id: true,
          }
        }
      },
    });
    return parcel;
  }
}
