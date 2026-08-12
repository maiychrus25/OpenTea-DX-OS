import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { ProfileForm } from './_components/ProfileForm'
import styles from './page.module.css'

export default async function HtxProfilePage() {
  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)

  // F4: Handle NotFoundError gracefully — do not crash the page
  let profile = null
  try {
    profile = await useCase.execute()
  } catch {
    // Profile not found or DB unavailable — render empty state
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Thông tin Hợp tác xã</h1>
        <p className={styles.description}>Quản lý và cập nhật thông tin chung của hợp tác xã.</p>
      </div>
      <ProfileForm initialData={profile} />
    </div>
  )
}
