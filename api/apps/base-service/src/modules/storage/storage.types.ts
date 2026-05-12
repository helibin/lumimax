export interface StorageUploadCredential {
  requestId: string;
  provider: string;
  bucket: string;
  region: string;
  objectKey: string;
  tmpPrefix?: string;
  mode?: 'presigned-url' | 'credentials';
  uploadMode?: 'presigned_put' | 'sts_credentials';
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  } | null;
  uploadUrl: string;
  expiresAt: number;
  method: 'PUT';
  headers: Record<string, string>;
  maxFileSize?: number;
  allowedMimeTypes?: string[];
}

export interface StorageObjectRecord {
  objectKey: string;
  provider: string;
  bucket: string;
  region: string;
  ownerType: 'user' | 'device' | 'system';
  ownerId: string;
  status: 'pending' | 'confirmed' | 'promoted';
  userId?: string | null;
  deviceId?: string | null;
  bizType?: string | null;
  bizId?: string | null;
  mediaType?: string | null;
  requestId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageSignedReadResult {
  requestId: string;
  objectKey: string;
  readUrl: string;
  expiresAt: number;
  provider: string;
  bucket: string;
  region: string;
}
