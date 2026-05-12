import { resolveServiceEnvFilePaths } from './config-env-paths';

export function resolveEnvFilePaths(serviceName: string, _env?: string): string[] {
  return resolveServiceEnvFilePaths(serviceName);
}

export { resolveServiceEnvFilePaths };
