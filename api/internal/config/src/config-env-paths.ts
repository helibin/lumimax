import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * Resolve monorepo env files:
 * - preferred layout: configs/{env}/{service}.env + configs/{env}/shared.env
 * - fallback layout: configs/{service}.env + configs/shared.env
 * - legacy layout: configs/{service}.{env}.env + configs/shared.{env}.env
 * - production: do not load env files, rely on platform-injected env variables
 */
export function resolveServiceEnvFilePaths(serviceName?: string): string[] {
  const nodeEnv = (process.env.NODE_ENV ?? 'development').trim();
  if (nodeEnv === 'production') {
    return [];
  }

  const cwd = process.cwd();
  const workspaceRoot = findWorkspaceRoot(cwd);
  const resolvedServiceName = normalizeServiceName(
    serviceName ?? process.env.SERVICE_NAME ?? guessServiceNameFromCwd(cwd),
  );

  const explicit = process.env.ENV_FILE?.trim() || process.env.DOTENV_CONFIG_PATH?.trim();
  const explicitPaths = explicit
    ? explicit
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => (isAbsolute(entry) ? entry : resolve(workspaceRoot, entry)))
    : [];

  const configDir = resolve(workspaceRoot, 'configs');
  const envDir = resolve(configDir, nodeEnv);
  const candidates = uniquePaths([
    ...explicitPaths,
    resolve(envDir, `${resolvedServiceName}.local.env`),
    resolve(envDir, 'shared.local.env'),
    resolve(envDir, `${resolvedServiceName}.env`),
    resolve(envDir, 'shared.env'),
    resolve(configDir, `${resolvedServiceName}.local.env`),
    resolve(configDir, 'shared.local.env'),
    resolve(configDir, `${resolvedServiceName}.env`),
    resolve(configDir, 'shared.env'),
    resolve(configDir, `${resolvedServiceName}.${nodeEnv}.local.env`),
    resolve(configDir, `shared.${nodeEnv}.local.env`),
    resolve(configDir, `${resolvedServiceName}.${nodeEnv}.env`),
    resolve(configDir, `shared.${nodeEnv}.env`),
  ]);

  return candidates.filter((filePath) => existsSync(filePath));
}

function normalizeServiceName(value: string): string {
  return value.trim().replace(/^@lumimax\//, '');
}

function guessServiceNameFromCwd(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'app';
}

function uniquePaths(paths: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const filePath of paths) {
    if (seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);
    deduped.push(filePath);
  }
  return deduped;
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}
