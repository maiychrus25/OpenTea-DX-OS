// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface UploadResult {
  minioKey: string;
  presignedUrl: string;
}

export interface StoragePort {
  /**
   * Uploads a file to storage and returns its key and a temporary pre-signed URL.
   */
  uploadFile(file: Buffer, fileName: string, mimeType: string): Promise<UploadResult>;
  getPresignedUrl(key: string, expiresIn?: number): Promise<string>;
  getFileBuffer(key: string): Promise<Buffer>;
}
