// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { PrismaAppActionRepository } from '@/infrastructure/db/agent/PrismaAppActionRepository'
import { AppActionCatalog } from './AppActionCatalog'
import { AppsActorClient } from './apps-actor-client'

const client = new AppsActorClient()

/** The process-wide catalogue of installed mini-app actions. */
export const appActionCatalog = new AppActionCatalog(new PrismaAppActionRepository(), (call) => client.call(call))
