import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadRuntimeEnv(): string[] {
  const rootDir = resolve(process.cwd());
  const envName = pickRuntimeEnvName();
  const serviceName = normalizeServiceName(process.env.SERVICE_NAME);
  const candidates = [
    resolve(rootDir, 'configs', envName, 'shared.env'),
    serviceName
      ? resolve(rootDir, 'configs', envName, `${serviceName}.env`)
      : '',
  ].filter(Boolean);

  const loadedPaths: string[] = [];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    process.loadEnvFile(filePath);
    loadedPaths.push(filePath);
  }

  return loadedPaths;
}

function pickRuntimeEnvName(): string {
  const envName = String(process.env.NODE_ENV ?? 'development').trim().toLowerCase();
  if (envName === 'production') {
    return 'production';
  }
  if (envName === 'test') {
    return 'test';
  }
  return 'development';
}

function normalizeServiceName(value: string | undefined): string {
  const serviceName = String(value ?? '').trim();
  if (!serviceName || serviceName === 'scripts') {
    return '';
  }
  return serviceName;
}
