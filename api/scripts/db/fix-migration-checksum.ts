import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { loadRuntimeEnv } from '../env/load-env.ts';

const migrationId = process.argv[2];
if (!migrationId) {
  throw new Error('Usage: node --import tsx scripts/db/fix-migration-checksum.ts <migration_id>');
}

loadRuntimeEnv();

const dbUrl = process.env.DB_MIGRATION_URL?.trim() || process.env.DB_URL?.trim();
if (!dbUrl) {
  throw new Error('Missing DB connection URL from DB_MIGRATION_URL or DB_URL.');
}

const migrationsDir = resolve(process.cwd(), 'data/db/migrations');
const migrationFileName = readdirSync(migrationsDir).find(
  (name) => name.startsWith(`${migrationId}_`) && name.endsWith('.sql'),
);
if (!migrationFileName) {
  throw new Error(`Migration file not found for id ${migrationId}.`);
}
const migrationFile = resolve(migrationsDir, migrationFileName);
const sql = readFileSync(migrationFile, 'utf8');
const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');

async function main(): Promise<void> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const existing = await client.query(
      'SELECT id, file_name, checksum FROM public.schema_migrations WHERE id = $1',
      [migrationId],
    );
    if (existing.rowCount === 0) {
      throw new Error(`Migration ${migrationId} not found in schema_migrations.`);
    }

    await client.query('UPDATE public.schema_migrations SET checksum = $1 WHERE id = $2', [
      checksum,
      migrationId,
    ]);

    const updated = await client.query(
      'SELECT id, file_name, checksum FROM public.schema_migrations WHERE id = $1',
      [migrationId],
    );
    console.log(JSON.stringify(updated.rows[0], null, 2));
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exit(1);
});
