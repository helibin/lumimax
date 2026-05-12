import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { loadRuntimeEnv } from '../env/load-env.ts';

async function main(): Promise<void> {
  const migrationId = process.argv[2];
  const fileName = process.argv[3];

  if (!migrationId || !fileName) {
    throw new Error(
      'Usage: node --import tsx scripts/db/repair-migration-checksum.ts <migration_id> <file_name>',
    );
  }

  loadRuntimeEnv();

  const dbUrl = process.env.DB_MIGRATION_URL?.trim() || process.env.DB_URL?.trim();
  if (!dbUrl) {
    throw new Error('Missing env: DB_URL');
  }

  const absolutePath = resolve(process.cwd(), 'data/db/migrations', fileName);
  const sql = readFileSync(absolutePath, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const result = await client.query(
      'UPDATE public.schema_migrations SET checksum = $1 WHERE id = $2',
      [checksum, migrationId],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Migration record not found: ${migrationId}`);
    }
    console.log(`Repaired checksum for ${fileName}: ${checksum}`);
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(detail);
  process.exit(1);
});
