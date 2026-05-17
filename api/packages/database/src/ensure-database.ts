import { getEnvString, resolveServiceEnvFilePaths } from '@lumimax/config';
import { connectPgWithRetry } from './pg-connect-with-retry';
import { normalizeLocalhostConnectionUrl } from './normalize-db-url';

const MISSING_DATABASE_ERROR_CODE = '3D000';
const DUPLICATE_DATABASE_ERROR_CODE = '42P04';

type PgError = Error & {
  code?: string;
};

export async function ensureDatabaseReady(serviceName?: string): Promise<void> {
  loadEnvFiles(serviceName);

  const targetDbUrl = resolveTargetDbUrl();
  const targetDatabaseName = getDatabaseName(targetDbUrl);

  if (!targetDatabaseName) {
    throw new Error(
      `Unable to resolve database name from URL: ${maskDbUrl(targetDbUrl)}`,
    );
  }

  try {
    await canConnect(targetDbUrl);
    return;
  } catch (error) {
    if (!isMissingDatabaseError(error)) {
      throw error;
    }
  }

  const maintenanceDbUrl = buildMaintenanceDbUrl(targetDbUrl);
  const client = await connectPgWithRetry(maintenanceDbUrl);

  try {
    await client.query(
      `CREATE DATABASE ${quoteIdentifier(targetDatabaseName)}`,
    );
  } catch (error) {
    if (!isDuplicateDatabaseError(error)) {
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function canConnect(connectionString: string): Promise<void> {
  const client = await connectPgWithRetry(connectionString);
  await client.end().catch(() => undefined);
}

function loadEnvFiles(serviceName?: string): void {
  const envFilePaths = resolveServiceEnvFilePaths(serviceName);
  for (const envFilePath of envFilePaths) {
    process.loadEnvFile(envFilePath);
  }
}

function resolveTargetDbUrl(): string {
  const explicit =
    getEnvString('DB_SETUP_URL') ||
    getEnvString('DB_MIGRATION_URL') ||
    getEnvString('DB_SEED_URL') ||
    getEnvString('DB_URL');

  if (explicit?.trim()) {
    return normalizeLocalhostConnectionUrl(explicit) ?? explicit.trim();
  }

  throw new Error(
    'No database URL found. Set DB_SETUP_URL, DB_MIGRATION_URL, DB_SEED_URL, or DB_URL.',
  );
}

function buildMaintenanceDbUrl(targetDbUrl: string): string {
  const maintenanceUrl = new URL(targetDbUrl);
  const databaseName = (
    getEnvString('DB_BOOTSTRAP_DATABASE') ||
    getEnvString('DB_ADMIN_DATABASE') ||
    'postgres'
  ).trim();

  maintenanceUrl.pathname = `/${databaseName}`;
  return maintenanceUrl.toString();
}

function getDatabaseName(dbUrl: string): string {
  const { pathname } = new URL(dbUrl);
  return decodeURIComponent(pathname.replace(/^\/+/, '').trim());
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function isMissingDatabaseError(error: unknown): boolean {
  return (error as PgError)?.code === MISSING_DATABASE_ERROR_CODE;
}

function isDuplicateDatabaseError(error: unknown): boolean {
  return (error as PgError)?.code === DUPLICATE_DATABASE_ERROR_CODE;
}

function maskDbUrl(dbUrl: string): string {
  const parsed = new URL(dbUrl);
  if (parsed.password) {
    parsed.password = '***';
  }
  return parsed.toString();
}
