// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { mcpToolsFor } from '@/application/mcp/McpTools'
import { resolveMcpUser } from '@/application/mcp/McpUser'
import { requireMcpCaller } from '@/lib/api/mcp-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { labsOnly } from '@/lib/labs'

/** The tools the bearer's person may call through MCP (M14 contract C1). */
async function getMcpTools(request: Request) {
  const caller = await requireMcpCaller(request)
  const user = await resolveMcpUser(caller.sub)
  return NextResponse.json({ tools: mcpToolsFor(user.tenant.role) })
}

export const GET = withErrorHandler(labsOnly(getMcpTools))

// DXOS_LABS is read per request; a prerendered answer would freeze the switch into the build.
export const dynamic = 'force-dynamic'
