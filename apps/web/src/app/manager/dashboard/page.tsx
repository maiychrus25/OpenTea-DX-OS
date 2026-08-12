// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import styles from './Dashboard.module.css'

export default async function ManagerDashboard() {
  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)

  let hasProfile = false
  try {
    await useCase.execute()
    hasProfile = true
  } catch (error) {
    if (error instanceof NotFoundError) {
      hasProfile = false
    } else {
      // Re-throw unexpected infrastructure/DB errors
      throw error
    }
  }

  return (
    <main className={styles.container}>
      <h1 className={styles.heading}>Tổng quan — Trưởng HTX</h1>
      <p className={styles.welcomeText}>Chào mừng bạn đến với bảng điều khiển dành cho Trưởng Hợp tác xã.</p>

      {!hasProfile && (
        <section className={styles.ctaCard} aria-labelledby="onboarding-cta-title">
          <h2 id="onboarding-cta-title" className={styles.ctaTitle}>Chưa thiết lập Hợp tác xã</h2>
          <p className={styles.ctaDesc}>Bạn cần cập nhật thông tin Hợp tác xã trước khi sử dụng các tính năng khác.</p>
          <Link href="/manager/profile" className={styles.ctaButton}>
            Thiết lập ngay
          </Link>
        </section>
      )}

      {/* Feature links and upcoming sections will go here */}
    </main>
  )
}
