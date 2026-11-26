// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ChatTool } from '../types'
import { bulletinTool } from './bulletin'
import { harvestScheduleTool } from './harvest-schedule'
import { journalTool } from './journal'
import { lotsTool } from './lots'
import { marketTool } from './market'
import { nearbyTool } from './nearby'
import { notificationsTool } from './notifications'
import { parcelsTool } from './parcels'
import { pendingTool } from './pending'
import { todayTool } from './today'
import { weatherTool } from './weather'

/** Read tools of the Telegram assistant, in the order of contract C5 (M5 plan). */
export const CHAT_TOOLS: readonly ChatTool[] = [
  todayTool,
  pendingTool,
  weatherTool,
  marketTool,
  bulletinTool,
  notificationsTool,
  journalTool,
  harvestScheduleTool,
  parcelsTool,
  lotsTool,
  nearbyTool,
]
