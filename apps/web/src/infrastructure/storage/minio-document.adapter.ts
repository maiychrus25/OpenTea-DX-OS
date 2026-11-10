// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Client } from 'minio'
import { minioEndpoint } from './minio-endpoint'
import { DocumentStoragePort, DocumentItem } from '@/domain/document/ports/document-storage.port'

export class MinioDocumentAdapter implements DocumentStoragePort {
  private minioClient: Client
  private minioPublicClient: Client
  private bucketName: string
  private bucketCreated: boolean = false

  constructor() {
    this.bucketName = 'agrimarket-private'
    
    const internal = minioEndpoint()
    
    // Internal client
    this.minioClient = new Client({
      endPoint: internal.host,
      port: internal.port,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      region: 'us-east-1',
    })

    // Public client for URLs
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
      } catch (e) {}
    } else if (internal.host === 'minio') {
      publicHost = 'localhost';
      publicPort = 9000;
      publicSsl = false;
    } else {
      publicHost = internal.host;
      publicPort = internal.port;
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

  private async ensureBucketExists() {
    if (this.bucketCreated) return
    const exists = await this.minioClient.bucketExists(this.bucketName)
    if (!exists) {
      // Create bucket if it doesn't exist. Region is us-east-1 by default.
      await this.minioClient.makeBucket(this.bucketName, 'us-east-1')
    }
    this.bucketCreated = true
  }

  async generateUploadUrl(path: string, expiresIn: number = 900): Promise<{ url: string; key: string }> {
    await this.ensureBucketExists()
    const presignedUrl = await this.minioPublicClient.presignedPutObject(this.bucketName, path, expiresIn)
    return {
      url: presignedUrl,
      key: path,
    }
  }

  async generateDownloadUrl(key: string, download: boolean = false, expiresIn: number = 3600): Promise<string> {
    await this.ensureBucketExists()
    const reqParams: { [key: string]: string } = {}
    
    if (download) {
      const fileName = key.split('/').pop() || 'document'
      reqParams['response-content-disposition'] = `attachment; filename="${fileName}"`
    }

    const url = await this.minioPublicClient.presignedGetObject(this.bucketName, key, expiresIn, reqParams)
    return url;
  }

  async listDocuments(prefix: string = ''): Promise<DocumentItem[]> {
    await this.ensureBucketExists()
    
    return new Promise((resolve, reject) => {
      const documents: DocumentItem[] = []
      // Use listObjectsV2 with recursive=false to support pseudo-folders
      const stream = this.minioClient.listObjectsV2(this.bucketName, prefix, false)
      
      stream.on('data', (obj) => {
        // MinIO returns 'prefix' if it's a directory (pseudo-folder) when recursive is false
        const isDir = (obj.prefix !== undefined && obj.prefix !== null)
        
        // When it's a dir, name is in obj.prefix
        // When it's a file, name is in obj.name
        const key = isDir ? (obj.prefix as string) : (obj.name as string)
        const name = key.replace(prefix, '').replace(/\/$/, '')
        
        // Skip the prefix itself if it comes up as a folder
        if (!name) return

        documents.push({
          name,
          size: obj.size || 0,
          uploadDate: obj.lastModified || new Date(),
          key,
          isDir
        })
      })

      stream.on('end', () => resolve(documents))
      stream.on('error', (err) => reject(err))
    })
  }

  async getDocumentContent(key: string): Promise<string> {
    await this.ensureBucketExists()
    
    return new Promise(async (resolve, reject) => {
      try {
        const stream = await this.minioClient.getObject(this.bucketName, key)
        let content = ''
        stream.on('data', (chunk) => {
          content += chunk.toString()
        })
        stream.on('end', () => resolve(content))
        stream.on('error', (err) => reject(err))
      } catch (err) {
        reject(err)
      }
    })
  }

  async uploadDocument(key: string, content: Buffer | string, mimeType?: string): Promise<void> {
    await this.ensureBucketExists()
    
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
    const metaData: { [key: string]: string } = {}
    if (mimeType) {
      metaData['Content-Type'] = mimeType
    } else if (key.endsWith('.txt')) {
      metaData['Content-Type'] = 'text/plain'
    } else if (key.endsWith('.json')) {
      metaData['Content-Type'] = 'application/json'
    }

    await this.minioClient.putObject(this.bucketName, key, buffer, buffer.length, metaData)
  }
}
