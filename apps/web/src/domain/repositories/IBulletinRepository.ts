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

// A type alias (not an interface) so the list can be stored as JSON.
export type BulletinSource = {
  source: string;
  metric: string;
  value: number;
  unit: string;
  period: string;
};

export interface PublishBulletinRecord {
  commodity: string;
  bulletinVi: string;
  sources: BulletinSource[];
  modelUsed: string;
}

export interface IBulletinRepository {
  /** Published rows the cooperative may read: its own row first, otherwise the latest shared row. */
  getLatestBulletin(commodity: string, htxCode: string): Promise<Bulletin | null>;
  /** One bulletin per commodity, the cooperative's own row over a shared one. */
  getAllLatestBulletins(htxCode: string): Promise<Bulletin[]>;
  getAvailableCommodities(htxCode: string): Promise<string[]>;
  /** Marks the cooperative's earlier rows of the commodity not latest, then stores the new published row. */
  publish(htxCode: string, record: PublishBulletinRecord): Promise<{ id: string }>;
}
