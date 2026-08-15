// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { prisma } from '@/infrastructure/db/prisma.client'
import { StorefrontView } from './_components/StorefrontView'

interface StorefrontPageProps {
  params: {
    htx_code: string
  }
}

export async function generateMetadata({ params }: StorefrontPageProps): Promise<Metadata> {
  const htx = await prisma.htxProfile.findUnique({
    where: { htx_code: params.htx_code },
    select: { name: true }
  })

  if (!htx) {
    return { title: 'Không tìm thấy HTX' }
  }

  return {
    title: `Hồ sơ năng lực HTX — ${htx.name}`,
    description: `Hồ sơ năng lực công khai của Hợp tác xã ${htx.name}`
  }
}

export default async function StorefrontPage({ params }: StorefrontPageProps) {
  const htx = await prisma.htxProfile.findUnique({
    where: { htx_code: params.htx_code },
    include: {
      lots: {
        where: { status: 'READY' },
        orderBy: { created_at: 'desc' },
      },
      _count: {
        select: { households: true }
      }
    }
  })

  if (!htx) {
    notFound()
  }

  return <StorefrontView htx={htx} />
}
