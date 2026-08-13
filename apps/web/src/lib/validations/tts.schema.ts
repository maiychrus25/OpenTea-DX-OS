// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { z } from 'zod'

export const ttsRequestSchema = z.object({
  text: z.string().min(1, 'Văn bản không được để trống').max(500, 'Văn bản vượt quá 500 ký tự'),
})

export type TtsRequest = z.infer<typeof ttsRequestSchema>
