// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Client } from 'minio'
import { StoragePort, UploadResult } from '@/domain/disease/ports/storage.port'

export class MinioStorageAdapter implements StoragePort {
  private minioClient: Client
  private bucketName: string

  constructor() {
    this.bucketName = process.env.MINIO_BUCKET_NAME || 'agrimarket-docs'
    
    this.minioClient = new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    })
  }

  async uploadFile(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<UploadResult> {
    const key = `disease-reports/${Date.now()}-${fileName}`

    // Upload the file
    await this.minioClient.putObject(this.bucketName, key, fileBuffer, fileBuffer.length, {
      'Content-Type': mimeType,
    })

    // Generate pre-signed URL valid for 15 minutes (900 seconds)
    const presignedUrl = await this.minioClient.presignedGetObject(this.bucketName, key, 900)

    return {
      minioKey: key,
      presignedUrl,
    }
  }

  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return this.minioClient.presignedGetObject(this.bucketName, key, expiresIn)
  }
}
