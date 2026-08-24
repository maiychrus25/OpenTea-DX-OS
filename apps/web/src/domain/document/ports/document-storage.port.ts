// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface DocumentItem {
  name: string
  size: number
  uploadDate: Date
  key: string
  isDir: boolean
}

export interface DocumentStoragePort {
  /**
   * Generates a pre-signed URL for uploading a document directly to storage
   * @param path The full path/key in the storage bucket (e.g., para/Projects/file.pdf)
   * @param expiresIn Seconds until the URL expires
   */
  generateUploadUrl(path: string, expiresIn?: number): Promise<{ url: string; key: string }>

  /**
   * Generates a pre-signed URL for downloading/viewing a document
   * @param key The key of the document in storage
   * @param download If true, forces the browser to download the file instead of opening it
   * @param expiresIn Seconds until the URL expires
   */
  generateDownloadUrl(key: string, download?: boolean, expiresIn?: number): Promise<string>

  /**
   * Lists documents in a specific folder path
   * @param prefix The path prefix to list documents from
   */
  listDocuments(prefix?: string): Promise<DocumentItem[]>

  /**
   * Fetch the text content of a document from storage
   * @param key The key of the document in storage
   */
  getDocumentContent(key: string): Promise<string>
}
