// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** The user's current state in the identity provider, read at decision time, never from the link. */
export interface LiveUserState {
  roles: string[]
  enabled: boolean
  htxCode: string | null
}

export interface LiveRoleReader {
  read(userId: string): Promise<LiveUserState | null>
}
