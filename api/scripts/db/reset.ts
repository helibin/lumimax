import { Client } from 'pg';
import { loadRuntimeEnv } from '../env/load-env.ts';

const LOCK_KEY = 23810919;

loadRuntimeEnv();

async function main(): Promise<void> {
  const dbUrl = resolveDbUrl();
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      await client.query('DROP SCHEMA IF EXISTS public CASCADE');
      await client.query('CREATE SCHEMA public');
      await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
      await client.query('GRANT ALL ON SCHEMA public TO PUBLIC');
      console.log('Database schema reset completed.');
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}

function resolveDbUrl(): string {
  const explicit =
    process.env.DB_RESET_URL
    || process.env.DB_MIGRATION_URL
    || process.env.DB_URL;

  if (explicit?.trim()) {
    return explicit;
  }

  throw new Error(
    'No database URL found. Set DB_RESET_URL, DB_MIGRATION_URL, or DB_URL.',
  );
}

void main();
