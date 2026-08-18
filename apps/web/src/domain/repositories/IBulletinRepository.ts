// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface Bulletin {
  id: string;
  commodity: string;
  bulletin_vi: string;
  sources_json: any;
  model_used: string;
  is_latest: boolean;
  created_at: Date;
}

export interface IBulletinRepository {
  getLatestBulletin(commodity: string): Promise<Bulletin | null>;
}
