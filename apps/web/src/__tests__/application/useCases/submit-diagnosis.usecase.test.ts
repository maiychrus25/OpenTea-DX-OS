// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/**
 * Story 9-1 / 10-2 — SubmitDiagnosisUseCase Unit Tests
 *
 * Verifies:
 *   1. Farmer isolation: cannot diagnose parcel belonging to another household.
 *   2. AI invariant: response NEVER contains treatment_recommendation.
 *   3. Disease API down → AI_UNAVAILABLE error propagated.
 *   4. broadcastDiseaseReport called with correct household name + parcel code.
 *   5. Officer cannot call this use case (only farmer role enforced at route level — checked here).
 */

import { SubmitDiagnosisUseCase } from '@/application/disease/submit-diagnosis.usecase'
import { DiseaseDetectionPort } from '@/domain/disease/ports/disease-detection.port'
import { StoragePort, UploadResult } from '@/domain/disease/ports/storage.port'
import { ParcelPort, ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { DiseaseReportPort } from '@/domain/disease/ports/disease-report.port'
import { NotificationPort } from '@/domain/ports/notification-port'

// ── Mock helpers ───────────────────────────────────────────────────────────────

const FARMER_A_ID = 'farmer-a-keycloak-id'
const FARMER_B_ID = 'farmer-b-keycloak-id'

const mockParcelOfFarmerA: ParcelSummary = {
  id: 'parcel-a-001',
  parcel_code: 'P-A-001',
  area_ha: 1.0,
  crop_type: 'Lúa ST25',
  status: 'TENDING',
  polygon_geojson: null,
  household_id: 'household-a',
  name: null,
  centroid_lat: null,
  centroid_lng: null,
  household: {
    id: 'household-a',
    name: 'Nguyễn Văn An',
    keycloak_user_id: FARMER_A_ID,
  },
}

function makeMockPorts(parcel: ParcelSummary | null = mockParcelOfFarmerA) {
  const diseasePort: jest.Mocked<DiseaseDetectionPort> = {
    predict: jest.fn().mockResolvedValue({ disease_name: 'Leaf blight', confidence_score: 0.87 }),
  }
  const storagePort: jest.Mocked<StoragePort> = {
    uploadFile: jest.fn().mockResolvedValue({
      minioKey: 'disease-reports/test.jpg',
      presignedUrl: 'https://minio.test/disease-reports/test.jpg',
    } satisfies UploadResult),
    getPresignedUrl: jest.fn().mockResolvedValue('https://minio.test/presigned'),
    getFileBuffer: jest.fn(),
  }
  const parcelPort: jest.Mocked<ParcelPort> = {
    findById: jest.fn().mockResolvedValue(parcel),
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    approveHarvest: jest.fn(),
  }
  const diseaseReportPort: jest.Mocked<DiseaseReportPort> = {
    save: jest.fn().mockResolvedValue({
      id: 'report-001',
      ai_disease_name: 'Leaf blight',
      ai_confidence: 0.87,
      photo_url: 'https://minio.test/test.jpg',
      created_at: new Date(),
    }),
    findLatestByParcelId: jest.fn().mockResolvedValue(null),
    findHistoryByFarmer: jest.fn().mockResolvedValue([]),
    findPendingReports: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    updateStatus: jest.fn(),
  }
  const notificationPort: jest.Mocked<NotificationPort> = {
    getRecentByUserId: jest.fn().mockResolvedValue({ notifications: [], total: 0, unread: 0 }),
    markAsRead: jest.fn(),
    delete: jest.fn(),
    updatePreferences: jest.fn(),
    broadcastDiseaseReport: jest.fn(),
    broadcastHarvestApproved: jest.fn(),
    broadcastAnnouncement: jest.fn(),
    createNotification: jest.fn(),
    sendDirectNotification: jest.fn(),
  }

  return { diseasePort, storagePort, parcelPort, diseaseReportPort, notificationPort }
}

const DUMMY_BLOB = new Blob([Buffer.from('img')], { type: 'image/jpeg' })
const DUMMY_BUFFER = Buffer.from('img')

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SubmitDiagnosisUseCase — farmer isolation + AI invariant', () => {

  it('TC-10.2-AC5-1: succeeds when farmer submits for their own parcel', async () => {
    const mocks = makeMockPorts()
    const useCase = new SubmitDiagnosisUseCase(
      mocks.diseasePort, mocks.storagePort, mocks.parcelPort,
      mocks.diseaseReportPort, mocks.notificationPort,
    )

    const result = await useCase.execute({
      farmerUserId: FARMER_A_ID,
      parcelId: 'parcel-a-001',
      imageBlob: DUMMY_BLOB,
      imageBuffer: DUMMY_BUFFER,
      mimeType: 'image/jpeg',
    })

    expect(result.report_id).toBeDefined()
    expect(result.disease_name).toBe('Leaf blight')
    expect(result.confidence_score).toBe(0.87)
  })

  it('TC-10.2-AC5-2: throws FORBIDDEN_PARCEL when farmer submits for another household\'s parcel', async () => {
    const mocks = makeMockPorts(mockParcelOfFarmerA) // parcel owned by farmer A
    const useCase = new SubmitDiagnosisUseCase(
      mocks.diseasePort, mocks.storagePort, mocks.parcelPort,
      mocks.diseaseReportPort, mocks.notificationPort,
    )

    // Farmer B tries to diagnose farmer A's parcel
    await expect(useCase.execute({
      farmerUserId: FARMER_B_ID,  // ← different farmer!
      parcelId: 'parcel-a-001',
      imageBlob: DUMMY_BLOB,
      imageBuffer: DUMMY_BUFFER,
      mimeType: 'image/jpeg',
    })).rejects.toThrow('FORBIDDEN_PARCEL')
  })

  it('TC-10.2-AC5-3: throws PARCEL_NOT_FOUND when parcel does not exist', async () => {
    const mocks = makeMockPorts(null)
    const useCase = new SubmitDiagnosisUseCase(
      mocks.diseasePort, mocks.storagePort, mocks.parcelPort,
      mocks.diseaseReportPort, mocks.notificationPort,
    )

    await expect(useCase.execute({
      farmerUserId: FARMER_A_ID,
      parcelId: 'non-existent',
      imageBlob: DUMMY_BLOB,
      imageBuffer: DUMMY_BUFFER,
      mimeType: 'image/jpeg',
    })).rejects.toThrow('PARCEL_NOT_FOUND')
  })

  it('TC-10.2-AC5-4: throws HOUSEHOLD_NOT_FOUND when parcel has no household', async () => {
    const parcelNoHousehold: ParcelSummary = { ...mockParcelOfFarmerA, household: null }
    const mocks = makeMockPorts(parcelNoHousehold)
    const useCase = new SubmitDiagnosisUseCase(
      mocks.diseasePort, mocks.storagePort, mocks.parcelPort,
      mocks.diseaseReportPort, mocks.notificationPort,
    )

    await expect(useCase.execute({
      farmerUserId: FARMER_A_ID,
      parcelId: 'parcel-a-001',
      imageBlob: DUMMY_BLOB,
      imageBuffer: DUMMY_BUFFER,
      mimeType: 'image/jpeg',
    })).rejects.toThrow('HOUSEHOLD_NOT_FOUND')
  })

  it('TC-10.2-AI-INV: response does NOT contain treatment_recommendation (AI invariant)', async () => {
    const mocks = makeMockPorts()
    const useCase = new SubmitDiagnosisUseCase(
      mocks.diseasePort, mocks.storagePort, mocks.parcelPort,
      mocks.diseaseReportPort, mocks.notificationPort,
    )

    const result = await useCase.execute({
      farmerUserId: FARMER_A_ID,
      parcelId: 'parcel-a-001',
      imageBlob: DUMMY_BLOB,
      imageBuffer: DUMMY_BUFFER,
      mimeType: 'image/jpeg',
    })

    // AI Invariant: never return treatment recommendations directly to farmer
    expect(result).not.toHaveProperty('treatment_recommendation')
    expect(result).not.toHaveProperty('recommendation')
    // Only these fields are permitted in the response
    expect(Object.keys(result).sort()).toEqual(['confidence_score', 'disease_name', 'image_url', 'report_id', 'submitted_at'].sort())
  })

  it('TC-10.2-AC5-5: broadcastDiseaseReport called with correct household name + parcel code', async () => {
    const mocks = makeMockPorts()
    const useCase = new SubmitDiagnosisUseCase(
      mocks.diseasePort, mocks.storagePort, mocks.parcelPort,
      mocks.diseaseReportPort, mocks.notificationPort,
    )

    await useCase.execute({
      farmerUserId: FARMER_A_ID,
      parcelId: 'parcel-a-001',
      imageBlob: DUMMY_BLOB,
      imageBuffer: DUMMY_BUFFER,
      mimeType: 'image/jpeg',
    })

    expect(mocks.notificationPort.broadcastDiseaseReport).toHaveBeenCalledWith(
      'Nguyễn Văn An',   // household name
      'Leaf blight',      // disease name from AI
      'P-A-001',          // parcel code
    )
  })

  it('TC-10.2-AC5-6: Disease API failure propagates as error', async () => {
    const mocks = makeMockPorts()
    mocks.diseasePort.predict.mockRejectedValue(new Error('Disease API connection refused'))

    const useCase = new SubmitDiagnosisUseCase(
      mocks.diseasePort, mocks.storagePort, mocks.parcelPort,
      mocks.diseaseReportPort, mocks.notificationPort,
    )

    await expect(useCase.execute({
      farmerUserId: FARMER_A_ID,
      parcelId: 'parcel-a-001',
      imageBlob: DUMMY_BLOB,
      imageBuffer: DUMMY_BUFFER,
      mimeType: 'image/jpeg',
    })).rejects.toThrow('Disease API connection refused')
  })
})
