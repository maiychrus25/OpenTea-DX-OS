// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ChatAction } from '../types'
import { diseaseReportAction } from './disease-report'
import { diseaseReviewAction } from './disease-review'
import { harvestApproveAction } from './harvest-approve'
import { harvestScheduleAction } from './harvest-schedule'
import { householdAddAction, householdEditAction } from './household'
import { journalBatchApproveAction } from './journal-batch-approve'
import { journalCreateAction } from './journal-create'
import { journalDeleteAction } from './journal-delete'
import { journalEditAction } from './journal-edit'
import { lotCreateAction } from './lot-create'
import { lotExportQrAction } from './lot-export-qr'
import { memberApproveAction, memberInviteAction, memberRemoveAction } from './members'
import { notificationAnnounceAction, notificationClearAction, notificationReadAction } from './notifications'
import { parcelDeleteAction } from './parcel-delete'
import { profileEditAction } from './profile-edit'
import { roundStartAction } from './round-start'

/** Actions the Telegram assistant performs through a confirmation card, in the order of contract C6 (M5 plan) then C2 (#80). */
export const CHAT_ACTIONS: readonly ChatAction[] = [
  journalCreateAction,
  journalBatchApproveAction,
  harvestApproveAction,
  journalEditAction,
  journalDeleteAction,
  diseaseReviewAction,
  roundStartAction,
  harvestScheduleAction,
  lotCreateAction,
  lotExportQrAction,
  notificationAnnounceAction,
  notificationReadAction,
  notificationClearAction,
  memberInviteAction,
  memberApproveAction,
  memberRemoveAction,
  profileEditAction,
  householdAddAction,
  householdEditAction,
  parcelDeleteAction,
  diseaseReportAction,
]
