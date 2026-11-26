// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Coverage of the web's route methods by the Telegram assistant (spec §13.7, contract C11). Each row is
// `METHOD /api/<path>` with dynamic segments as in the folder name. Test 17 checks that every row is listed once.

export interface TelegramCoverage {
  /** Read in chat: a read tool answers from it. */
  readonly chatRead: readonly string[]
  /** Write in chat: a flow ends in a confirmation card. */
  readonly chatConfirm: readonly string[]
  /** Web only; the mini app or the web UI. Rows the spec does not name also stay here, so chat never reaches them. */
  readonly miniApp: readonly string[]
  /** Not through Telegram: sign-in, registration, development and site-only APIs, and Telegram link management. */
  readonly none: readonly string[]
}

export const TELEGRAM_COVERAGE: TelegramCoverage = {
  chatRead: [
    'GET /api/search',
    'GET /api/weather',
    'GET /api/weather/forecast',
    'GET /api/market-data',
    'GET /api/market-data/fx',
    'GET /api/bulletin',
    'GET /api/notifications',
    'GET /api/journal',
    'GET /api/lots',
    'GET /api/lots/[id]',
    'GET /api/lot/[lot_code]/certificate',
    'GET /api/schedule/harvest',
    'GET /api/schedule/unscheduled',
    'GET /api/farm/parcels',
    'GET /api/farm/parcels/[id]/soil-health',
    'GET /api/parcels/[id]/latest-photo',
    'GET /api/farm/households',
    'GET /api/farm/households/[id]',
    'GET /api/members',
    'GET /api/officer/diseases',
    'GET /api/profile',
    'GET /api/documents',
    'GET /api/documents/url',
    'GET /api/partners',
    'GET /api/agent/proposals',
  ],
  chatConfirm: [
    'POST /api/journal',
    'POST /api/journal/upload',
    'PUT /api/journal/[id]',
    'DELETE /api/journal/[id]',
    'POST /api/diagnosis',
    'POST /api/journal/batch-approve',
    'PUT /api/officer/diseases/[id]/review',
    'POST /api/parcels/[id]/start-round',
    'PATCH /api/schedule/harvest/[cycle_id]',
    'POST /api/lots',
    'POST /api/lots/[id]/export-qr',
    'POST /api/notifications/announce',
    'PUT /api/notifications',
    'DELETE /api/notifications',
    'POST /api/members/invite',
    'POST /api/members/[id]/approve',
    'DELETE /api/members/[id]',
    'PUT /api/profile',
    'POST /api/farm/households',
    'PUT /api/farm/households/[id]',
    'DELETE /api/farm/parcels/[id]',
    'POST /api/parcels/[id]/approve-harvest',
  ],
  miniApp: [
    'POST /api/farm/parcels',
    'PUT /api/farm/parcels/[id]',
    'POST /api/documents/upload',
    'GET /api/app-store',
    'GET /api/app-store/apps/[id]',
    'GET /api/app-store/apps/[id]/screenshots/[position]',
    'GET /api/app-store/history',
    'POST /api/app-store/requests',
    'POST /api/partners',
    'PUT /api/partners/[id]',
    'DELETE /api/partners/[id]',
    'POST /api/journal/[id]/review',
    'GET /api/agent/settings',
    'PUT /api/agent/settings',
    'POST /api/agent/proposals/[id]/decision',
    'GET /api/agent/campaigns/today',
    'POST /api/agent/campaigns/[id]/decision',
  ],
  none: [
    'GET /api/auth/[...nextauth]',
    'POST /api/auth/[...nextauth]',
    'POST /api/register',
    'GET /api/dev-login',
    'GET /api/debug/session',
    'GET /api/seed-farmer',
    'GET /api/health',
    'GET /api/notifications/stream',
    'GET /api/tts',
    'POST /api/tts',
    'GET /api/tts/status',
    'GET /api/geocode',
    'GET /api/chatbot',
    'POST /api/chatbot',
    'GET /api/chatbot/sessions',
    'GET /api/telegram/status',
    'POST /api/telegram/link',
    'DELETE /api/telegram/link',
    'POST /api/telegram/group-link',
  ],
}
