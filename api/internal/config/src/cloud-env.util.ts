export interface CloudCredentialPair {
  accessKeyId: string;
  secretAccessKey: string;
}

export function readEnvFirst(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function resolveCloudRegion(): string | undefined {
  return readEnvFirst('CLOUD_REGION');
}

export function resolveCloudCredentials(): CloudCredentialPair | undefined {
  const accessKeyId = readEnvFirst('CLOUD_ACCESS_KEY_ID');
  const secretAccessKey = readEnvFirst('CLOUD_ACCESS_KEY_SECRET');
  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }
  return {
    accessKeyId,
    secretAccessKey,
  };
}

export function resolveAliyunRegion(): string | undefined {
  return readEnvFirst('CLOUD_REGION');
}

export function resolveAliyunCredentials(): CloudCredentialPair | undefined {
  const accessKeyId = readEnvFirst('CLOUD_ACCESS_KEY_ID');
  const secretAccessKey = readEnvFirst('CLOUD_ACCESS_KEY_SECRET');
  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }
  return {
    accessKeyId,
    secretAccessKey,
  };
}
