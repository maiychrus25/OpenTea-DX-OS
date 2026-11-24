// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { telegramNotifier } from '@/application/telegram/telegram-services'
import { budgetLevel, vnMonth, vnMonthBounds, type BudgetLevel } from '@/domain/agent/budget'
import { PrismaAgentRunRepository } from '@/infrastructure/db/agent/PrismaAgentRunRepository'
import { PrismaAgentSettingsRepository } from '@/infrastructure/db/agent/PrismaAgentSettingsRepository'
import { logger } from '@/lib/logger'

export interface MonthlyBudget {
  month: string
  limit: number | null
  spent: number
  level: BudgetLevel
}

/** The cooperative's spend in the current Vietnam month, against its monthly budget. */
export async function readMonthlyBudget(htxCode: string, now: Date = new Date()): Promise<MonthlyBudget> {
  const month = vnMonth(now)
  const { start, end } = vnMonthBounds(month)
  const snapshot = await new PrismaAgentSettingsRepository().load(htxCode)
  const spent = await new PrismaAgentRunRepository().spentBetween(htxCode, start, end)
  return { month, limit: snapshot.monthlyLimit, spent, level: budgetLevel(snapshot.monthlyLimit, spent) }
}

/**
 * Queues the 80% and 100% warnings to the managers once per month. Called after a run reports its cost:
 * a Telegram or database problem is logged and never fails the run.
 */
export async function alertBudgetThresholds(htxCode: string, now: Date = new Date()): Promise<void> {
  try {
    const budget = await readMonthlyBudget(htxCode, now)
    if (budget.limit === null || budget.level === 'none' || budget.level === 'ok') return
    const monthStart = vnMonthBounds(budget.month).start
    const notifier = telegramNotifier()
    await notifier.queueBudgetAlert(htxCode, budget.month, 80, budget.spent, budget.limit, monthStart)
    if (budget.level === 'exhausted') {
      await notifier.queueBudgetAlert(htxCode, budget.month, 100, budget.spent, budget.limit, monthStart)
    }
  } catch (err) {
    logger.error('Agent: could not check the monthly budget', { htxCode, err })
  }
}

/** Banner state for the inbox: a failed lookup shows no banner rather than failing the page. */
export async function cooperativeBudgetLevel(htxCode: string): Promise<BudgetLevel> {
  try {
    return (await readMonthlyBudget(htxCode)).level
  } catch (err) {
    logger.error('Agent: could not read the monthly budget', { htxCode, err })
    return 'none'
  }
}
