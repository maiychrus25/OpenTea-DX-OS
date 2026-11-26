// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ChatAction } from '../types'
import { harvestApproveAction } from './harvest-approve'
import { journalBatchApproveAction } from './journal-batch-approve'
import { journalCreateAction } from './journal-create'

/** Actions the Telegram assistant performs through a confirmation card, in the order of contract C6 (M5 plan). */
export const CHAT_ACTIONS: readonly ChatAction[] = [
  journalCreateAction,
  journalBatchApproveAction,
  harvestApproveAction,
]
