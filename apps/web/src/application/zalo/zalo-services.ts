// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { PrismaZaloRepository } from '@/infrastructure/db/zalo/PrismaZaloRepository'
import { decryptToken, encryptToken } from '@/infrastructure/crypto/zalo-token-cipher'
import { ZaloCredentialService } from './ZaloCredentialService'
import { ZaloNotifier } from './ZaloNotifier'

export const zaloRepository = (): PrismaZaloRepository => new PrismaZaloRepository()
export const zaloNotifier = (): ZaloNotifier => new ZaloNotifier(zaloRepository())
export const zaloCredentials = (): ZaloCredentialService => new ZaloCredentialService(zaloRepository(), { encrypt: encryptToken, decrypt: decryptToken })
