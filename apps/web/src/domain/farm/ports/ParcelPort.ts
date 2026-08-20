// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface ParcelPort {
  findById(id: string): Promise<{ 
    centroid_lat: number | null; 
    centroid_lng: number | null;
    parcel_code: string;
    household_id: string;
    household?: { id: string; name: string; keycloak_user_id: string | null } | null;
  } | null>;
}
