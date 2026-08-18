// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { GenerateDocumentUploadUrlUseCase } from '@/application/document/generate-document-upload-url.usecase'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { z } from 'zod'

const uploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  pathPrefix: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== 'officer' && session.user.role !== 'manager')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const result = uploadSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', details: result.error.errors }, { status: 400 })
    }

    // Dependency Injection
    const storagePort = new MinioDocumentAdapter()
    const useCase = new GenerateDocumentUploadUrlUseCase(storagePort)

    const uploadData = await useCase.execute({
      fileName: result.data.fileName,
      pathPrefix: result.data.pathPrefix,
    })

    return NextResponse.json({ data: uploadData })

  } catch (error: any) {
    console.error('[Document Upload API]', error)
    if (error.message.includes('Invalid path prefix')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
