import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { loadRuntimeEnv } from '../env/load-env.ts';

type Command = 'up' | 'status' | 'create';

interface SeedFile {
  id: string;
  fileName: string;
  absolutePath: string;
  checksum: string;
  sql: string;
}

interface AppliedSeed {
  id: string;
  checksum: string;
  executed_at: string;
}

const SEEDS_DIR = resolve(process.cwd(), 'data/db/seeds');
const SEED_ID_PATTERN = /^(\d+)_([a-z0-9_]+)\.sql$/;
const LOCK_KEY = 23810918;

loadRuntimeEnv();

async function main(): Promise<void> {
  const command = (process.argv[2] ?? 'up') as Command;

  if (!['up', 'status', 'create'].includes(command)) {
    throw new Error(`Unsupported command: ${command}`);
  }

  if (command === 'create') {
    const name = process.argv[3];
    if (!name) {
      throw new Error('Usage: pnpm db:seed:create <seed_name>');
    }
    createSeed(name);
    return;
  }

  const dbUrl = resolveDbUrl(getOptionValue('--target'));
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await ensureSeedsTable(client);
    const files = readSeeds();
    const applied = await getAppliedSeeds(client);

    if (command === 'status') {
      printStatus(files, applied);
      return;
    }

    await seedUp(client, files, applied);
  } finally {
    await client.end();
  }
}

async function seedUp(
  client: Client,
  files: SeedFile[],
  applied: Map<string, AppliedSeed>,
): Promise<void> {
  if (files.length === 0) {
    console.log('No seed files found.');
    return;
  }

  await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
  try {
    let executedCount = 0;

    for (const seed of files) {
      const existing = applied.get(seed.id);
      if (existing) {
        if (existing.checksum !== seed.checksum) {
          throw new Error(
            `Checksum mismatch for seed ${seed.fileName}. File changed after applied.`,
          );
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(seed.sql);
        await client.query(
          `
          INSERT INTO public.schema_seeds(id, file_name, checksum, executed_at)
          VALUES($1, $2, $3, NOW())
          `,
          [seed.id, seed.fileName, seed.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      executedCount += 1;
      console.log(`Applied seed: ${seed.fileName}`);
    }

    if (executedCount === 0) {
      console.log('No pending seeds.');
      return;
    }

    console.log(`Done. Applied ${executedCount} seed file(s).`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
  }
}

function printStatus(
  files: SeedFile[],
  applied: Map<string, AppliedSeed>,
): void {
  if (files.length === 0) {
    console.log('No seed files found.');
    return;
  }

  const rows = files.map((file) => {
    const existing = applied.get(file.id);
    return {
      file: file.fileName,
      status: existing ? 'APPLIED' : 'PENDING',
      executedAt: existing?.executed_at ?? '-',
    };
  });

  console.table(rows);
}

async function ensureSeedsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_seeds (
      id VARCHAR(64) PRIMARY KEY,
      file_name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedSeeds(client: Client): Promise<Map<string, AppliedSeed>> {
  const { rows } = await client.query<AppliedSeed>(
    `
    SELECT id, checksum, executed_at::text
    FROM public.schema_seeds
    ORDER BY id ASC
    `,
  );

  return new Map(rows.map((row: AppliedSeed) => [row.id, row]));
}

function readSeeds(): SeedFile[] {
  if (!existsSync(SEEDS_DIR)) {
    return [];
  }

  const fileNames = readdirSync(SEEDS_DIR)
    .filter((fileName) => SEED_ID_PATTERN.test(fileName))
    .sort((a, b) => a.localeCompare(b));

  return fileNames.map((fileName) => {
    const absolutePath = join(SEEDS_DIR, fileName);
    const sql = readFileSync(absolutePath, 'utf8');
    const checksum = sha256(sql);
    const match = fileName.match(SEED_ID_PATTERN)!;

    return {
      id: match[1],
      fileName,
      absolutePath,
      sql,
      checksum,
    };
  });
}

function createSeed(rawName: string): void {
  const name = sanitizeName(rawName);
  if (!name) {
    throw new Error('Invalid seed name.');
  }

  mkdirSync(SEEDS_DIR, { recursive: true });
  const id = buildTimestampId();
  const fileName = `${id}_${name}.sql`;
  const absolutePath = join(SEEDS_DIR, fileName);

  if (existsSync(absolutePath)) {
    throw new Error(`Seed already exists: ${fileName}`);
  }

  const content = [
    '-- Write your seed SQL here.',
    '-- Seeds should remain idempotent for local/dev replays.',
    '',
  ].join('\n');

  writeFileSync(absolutePath, content, 'utf8');
  console.log(`Created seed: ${absolutePath}`);
}

function resolveDbUrl(target?: string): string {
  const explicit = process.env.DB_SEED_URL || process.env.DB_MIGRATION_URL || process.env.DB_URL;
  if (explicit?.trim()) {
    return explicit;
  }

  if (target) {
    const normalized = target.toLowerCase().replace(/-service$/, '');
    const allowedTargets = new Set(['user', 'notification', 'device', 'iot', 'storage', 'gateway', 'system']);
    if (!allowedTargets.has(normalized)) {
      throw new Error(`Unsupported --target value: ${target}`);
    }
    throw new Error('Missing env: DB_URL');
  }

  throw new Error(
    'No database URL found. Set DB_SEED_URL, DB_MIGRATION_URL, or DB_URL.',
  );
}

function getOptionValue(optionName: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`${optionName}=`));
  if (!match) {
    return undefined;
  }
  return match.slice(optionName.length + 1).trim();
}

function sanitizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildTimestampId(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
