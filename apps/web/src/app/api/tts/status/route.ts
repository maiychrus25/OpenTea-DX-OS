// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { PiperTtsAdapter } from '@/infrastructure/tts/PiperTtsAdapter'

export async function GET() {
  const adapter = new PiperTtsAdapter()
  const isAvailable = await adapter.checkHealth()
  
  return NextResponse.json({ available: isAvailable })
}
