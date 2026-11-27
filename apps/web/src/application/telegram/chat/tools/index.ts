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

// Issue #80 read tools (plan C1).
import { searchTool } from './search'
import { certificateTool } from './certificate'
import { soilTool } from './soil'
import { photoTool } from './photo'
import { householdsTool } from './households'
import { membersTool } from './members'
import { diseasesTool } from './diseases'
import { profileTool } from './profile'
import { documentsTool } from './documents'
import { partnersTool } from './partners'

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
  // Issue #80 (plan C1).
  searchTool,
  certificateTool,
  soilTool,
  photoTool,
  householdsTool,
  membersTool,
  diseasesTool,
  profileTool,
  documentsTool,
  partnersTool,
]
