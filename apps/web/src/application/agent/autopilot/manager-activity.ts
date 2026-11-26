// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { PrismaAutopilotRepository } from '@/infrastructure/db/agent/PrismaAutopilotRepository'
import { logger } from '@/lib/logger'

/** A manager acted: keeps the 7-day inactivity stop away. At most one write a minute; a failure never fails the request. */
export async function touchManagerActivity(htxCode: string, role: string, now: Date = new Date()): Promise<void> {
  if (role !== 'manager') return
  try {
    await new PrismaAutopilotRepository().touchManagerActivity(htxCode, now)
  } catch (err) {
    logger.error('Autopilot: could not record manager activity', { htxCode, err })
  }
}
