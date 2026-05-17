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

/** Object storage / STS（base-service） */
export function resolveCloudRegion(): string | undefined {
  return readEnvFirst('STORAGE_REGION');
}

export function resolveCloudCredentials(): CloudCredentialPair | undefined {
  const accessKeyId = readEnvFirst('STORAGE_ACCESS_KEY_ID');
  const secretAccessKey = readEnvFirst('STORAGE_ACCESS_KEY_SECRET');
  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }
  return {
    accessKeyId,
    secretAccessKey,
  };
}

/** AWS IoT 控制面（iot-service） */
export function resolveIotRegion(): string | undefined {
  return readEnvFirst('IOT_REGION');
}

export function resolveIotCredentials(): CloudCredentialPair | undefined {
  const accessKeyId = readEnvFirst('IOT_ACCESS_KEY_ID');
  const secretAccessKey = readEnvFirst('IOT_ACCESS_KEY_SECRET');
  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }
  return {
    accessKeyId,
    secretAccessKey,
  };
}

export function resolveAliyunRegion(): string | undefined {
  return resolveCloudRegion();
}

export function resolveAliyunCredentials(): CloudCredentialPair | undefined {
  return resolveCloudCredentials();
}
