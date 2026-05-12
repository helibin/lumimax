import { Client } from 'pg';
import { loadRuntimeEnv } from '../env/load-env.ts';

loadRuntimeEnv();

async function main(): Promise<void> {
  const targetDbUrl = resolveTargetDbUrl();
  const targetDatabaseName = getDatabaseName(targetDbUrl);

  if (!targetDatabaseName) {
    throw new Error(
      `Unable to resolve database name from URL: ${maskDbUrl(targetDbUrl)}`,
    );
  }

  const maintenanceDbUrl = buildMaintenanceDbUrl(targetDbUrl);
  const client = new Client({ connectionString: maintenanceDbUrl });
  await client.connect();

  try {
    const exists = await databaseExists(client, targetDatabaseName);
    if (exists) {
      console.log(`Database already exists: ${targetDatabaseName}`);
      return;
    }

    await client.query(
      `CREATE DATABASE ${quoteIdentifier(targetDatabaseName)}`,
    );
    console.log(`Database created: ${targetDatabaseName}`);
  } finally {
    await client.end();
  }
}

async function databaseExists(
  client: Client,
  databaseName: string,
): Promise<boolean> {
  const { rowCount } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1',
    [databaseName],
  );

  return (rowCount ?? 0) > 0;
}

function resolveTargetDbUrl(): string {
  const explicit =
    process.env.DB_SETUP_URL ||
    process.env.DB_MIGRATION_URL ||
    process.env.DB_SEED_URL ||
    process.env.DB_URL;

  if (explicit?.trim()) {
    return explicit.trim();
  }

  throw new Error(
    'No database URL found. Set DB_SETUP_URL, DB_MIGRATION_URL, DB_SEED_URL, or DB_URL.',
  );
}

function buildMaintenanceDbUrl(targetDbUrl: string): string {
  const maintenanceUrl = new URL(targetDbUrl);
  const databaseName = (
    process.env.DB_BOOTSTRAP_DATABASE ||
    process.env.DB_ADMIN_DATABASE ||
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

function maskDbUrl(dbUrl: string): string {
  const parsed = new URL(dbUrl);
  if (parsed.password) {
    parsed.password = '***';
  }
  return parsed.toString();
}

void main();
