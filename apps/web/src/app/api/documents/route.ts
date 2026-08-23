// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ListDocumentsUseCase } from '@/application/document/list-documents.usecase'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== 'officer' && session.user.role !== 'manager')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json({ error: 'path query parameter is required (e.g., para/Projects/)' }, { status: 400 })
    }

    // Dependency Injection
    const storagePort = new MinioDocumentAdapter()
    const useCase = new ListDocumentsUseCase(storagePort)

    const result = await useCase.execute({
      pathPrefix: path,
    })

    return NextResponse.json({ data: result })

  } catch (error) {
    console.error('[Document List API]', error)
    if (error instanceof Error && error.message.includes('Invalid path prefix')) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
