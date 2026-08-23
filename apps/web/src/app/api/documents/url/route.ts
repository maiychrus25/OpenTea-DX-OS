// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { GenerateDocumentDownloadUrlUseCase } from '@/application/document/generate-document-download-url.usecase'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== 'officer' && session.user.role !== 'manager')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')
    const downloadParam = searchParams.get('download')

    if (!key) {
      return NextResponse.json({ error: 'key query parameter is required' }, { status: 400 })
    }

    const download = downloadParam === 'true'

    // Dependency Injection
    const storagePort = new MinioDocumentAdapter()
    const useCase = new GenerateDocumentDownloadUrlUseCase(storagePort)

    const result = await useCase.execute({
      key,
      download,
    })

    return NextResponse.json({ data: result })

  } catch (error) {
    console.error('[Document Download URL API]', error)
    if (error instanceof Error && error.message.includes('Invalid key')) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
