// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { z } from 'zod';

export const weatherSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format (must be YYYY-MM-DD)' }),
  parcelId: z.string().cuid({ message: 'Invalid parcel ID' }),
});
