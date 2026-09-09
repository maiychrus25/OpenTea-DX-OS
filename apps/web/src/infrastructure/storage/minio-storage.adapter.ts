// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Client } from 'minio'
import { StoragePort, UploadResult } from '@/domain/disease/ports/storage.port'

export class MinioStorageAdapter implements StoragePort {
  private minioClient: Client
  private minioPublicClient: Client
  private bucketName: string

  constructor() {
    this.bucketName = process.env.MINIO_BUCKET_NAME || 'agrimarket-private'
    
    // Internal client for server-to-minio communication (e.g., minio:9000)
    this.minioClient = new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      region: 'us-east-1',
    })

    // Public client for generating presigned URLs (e.g., localhost:9000 or real domain)
    let publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT;
    let publicHost = 'localhost';
    let publicPort = 9000;
    let publicSsl = false;
    
    if (publicEndpoint) {
      try {
        const parsed = new URL(publicEndpoint);
        publicHost = parsed.hostname;
        publicPort = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
        publicSsl = parsed.protocol === 'https:';
      } catch (e) {
        // fallback
      }
    } else if (process.env.MINIO_ENDPOINT === 'minio' || !process.env.MINIO_ENDPOINT) {
      // Local docker-compose fallback for browser
      publicHost = 'localhost';
      publicPort = 9000;
      publicSsl = false;
    } else {
      // If it's something else, just use it
      publicHost = process.env.MINIO_ENDPOINT as string;
      publicPort = 9000;
      publicSsl = process.env.MINIO_USE_SSL === 'true';
    }

    this.minioPublicClient = new Client({
      endPoint: publicHost,
      port: publicPort,
      useSSL: publicSsl,
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      region: 'us-east-1',
    })
  }

  async uploadFile(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<UploadResult> {
    const key = `para/Archives/Disease_Photos/${Date.now()}-${fileName}`

    // Ensure bucket exists
    const exists = await this.minioClient.bucketExists(this.bucketName)
    if (!exists) {
      await this.minioClient.makeBucket(this.bucketName, 'us-east-1')
    }

    // Upload the file
    await this.minioClient.putObject(this.bucketName, key, fileBuffer, fileBuffer.length, {
      'Content-Type': mimeType,
    })

    // Generate pre-signed URL valid for 15 minutes (900 seconds)
    const presignedUrl = await this.minioPublicClient.presignedGetObject(this.bucketName, key, 900)

    return {
      minioKey: key,
      presignedUrl: presignedUrl,
    }
  }

  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const url = await this.minioPublicClient.presignedGetObject(this.bucketName, key, expiresIn)
    return url;
  }
}
