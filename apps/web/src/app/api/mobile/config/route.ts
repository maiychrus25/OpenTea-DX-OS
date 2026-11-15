// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import pkg from '../../../../../package.json'

// Read per request: the issuer is a runtime variable, not a build-time one.
export const dynamic = 'force-dynamic'

/** Public: where a phone signs in. The issuer is the one the browser is sent to (KEYCLOAK_ISSUER), never KEYCLOAK_INTERNAL_URL. */
export function GET() {
  return NextResponse.json(
    {
      oidc: {
        issuer: process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/agrimarket',
        client_id: 'dxos-mobile',
        redirect_uri: 'vn.opentea.dxos.tour:/oauth2redirect',
      },
      core_version: pkg.version,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
