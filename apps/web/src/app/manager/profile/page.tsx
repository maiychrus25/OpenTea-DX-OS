import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { ProfileForm } from './_components/ProfileForm'

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
    <div className="p-6 max-w-4xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Thông tin Hợp tác xã</h1>
        <p className="text-gray-500 text-sm mt-1">Quản lý và cập nhật thông tin chung của hợp tác xã.</p>
      </div>
      <ProfileForm initialData={profile} />
    </div>
  )
}
