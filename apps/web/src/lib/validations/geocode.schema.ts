// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { z } from 'zod'

export const geocodeQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters').max(200, 'Query too long'),
})

export type GeocodeQueryInput = z.infer<typeof geocodeQuerySchema>
