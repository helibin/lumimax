export interface CreateSignedUploadInput {
  bucket: string;
  region?: string;
  objectKey: string;
  ttlSeconds: number;
  contentType?: string;
}

export interface CreateSignedReadInput {
  objectKey: string;
  ttlSeconds: number;
  bucket?: string;
  region?: string;
  baseUrl?: string;
  signingSecret?: string;
}

export interface CopyObjectInput {
  sourceObjectKey: string;
  targetObjectKey: string;
  bucket: string;
  region?: string;
}

export interface StorageProviderInterface {
  readonly name: 's3' | 'oss';
  createSignedUpload(input: CreateSignedUploadInput): Promise<Record<string, unknown>>;
  createSignedRead(input: CreateSignedReadInput): Promise<string>;
  copyObject(input: CopyObjectInput): Promise<void>;
}
