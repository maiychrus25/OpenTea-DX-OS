// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createFeedLoader } from '@/application/apps/app-feed'
import { getCoreToken } from '@/lib/auth/core-token'

/** One loader per server process, so its 15 s cache is shared by the three layouts and the App Store. */
export const loadAppFeed = createFeedLoader({ getToken: getCoreToken, fetchImpl: (input, init) => fetch(input, init), now: Date.now })
