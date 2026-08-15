// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export function isHarvestSafe(safeHarvestDate: Date | null): boolean {
  if (!safeHarvestDate) return false;
  return safeHarvestDate.getTime() <= Date.now();
}
