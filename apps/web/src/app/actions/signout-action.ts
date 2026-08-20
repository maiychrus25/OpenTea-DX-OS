// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use server'

import { signOut } from '@/auth'

/**
 * Server action to handle user sign out.
 * This ensures the sign-out process is executed server-side, 
 * terminating the NextAuth session and triggering the Keycloak OIDC end_session_endpoint via events.signOut.
 */
export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
