import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { loadRuntimeEnv } from '../env/load-env.ts';

const seedId = process.argv[2];
if (!seedId) {
  throw new Error('Usage: node --import tsx scripts/db/fix-seed-checksum.ts <seed_id>');
}

loadRuntimeEnv();

const dbUrl = process.env.DB_SEED_URL?.trim() || process.env.DB_MIGRATION_URL?.trim() || process.env.DB_URL?.trim();
if (!dbUrl) {
  throw new Error('Missing DB connection URL from DB_SEED_URL / DB_MIGRATION_URL / DB_URL.');
}

const seedsDir = resolve(process.cwd(), 'data/db/seeds');
const seedFileName = readdirSync(seedsDir).find((name) => name.startsWith(`${seedId}_`) && name.endsWith('.sql'));
if (!seedFileName) {
  throw new Error(`Seed file not found for id ${seedId}.`);
}

const seedFile = resolve(seedsDir, seedFileName);
const sql = readFileSync(seedFile, 'utf8');
const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');

async function main(): Promise<void> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const existing = await client.query(
      'SELECT id, file_name, checksum FROM public.schema_seeds WHERE id = $1',
      [seedId],
    );
    if (existing.rowCount === 0) {
      throw new Error(`Seed ${seedId} not found in schema_seeds.`);
    }

    await client.query('UPDATE public.schema_seeds SET checksum = $1 WHERE id = $2', [
      checksum,
      seedId,
    ]);

    const updated = await client.query(
      'SELECT id, file_name, checksum FROM public.schema_seeds WHERE id = $1',
      [seedId],
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
