import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { loadRuntimeEnv } from '../env/load-env.ts';

interface TableRow {
  table_name: string;
}

interface ColumnRow {
  column_name: string;
  is_nullable: 'YES' | 'NO';
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  datetime_precision: number | null;
  column_default: string | null;
}

interface ConstraintRow {
  constraint_name: string;
  constraint_type: 'PRIMARY KEY' | 'UNIQUE';
  columns: string;
}

interface IndexRow {
  indexname: string;
  indexdef: string;
}

type SeedValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];

const INTERNAL_TABLES = new Set(['schema_migrations', 'schema_seeds']);
const SCHEMA_FILE = resolve(
  process.cwd(),
  'data/db/migrations/20260503100000_init_platform_schema.sql',
);
const SEED_FILE = resolve(
  process.cwd(),
  'data/db/seeds/20260503101000_init_platform_seed.sql',
);

const SEED_TABLES = [
  'system_permissions',
  'system_roles',
  'system_role_permissions',
  'system_dictionaries',
  'system_dictionary_items',
  'system_configs',
  'notification_templates',
  'system_admins',
  'system_admin_roles',
] as const;

loadRuntimeEnv();

async function main(): Promise<void> {
  const client = new Client({ connectionString: resolveDbUrl() });
  await client.connect();

  try {
    const tables = await loadTables(client);
    const schemaSql = await buildSchemaSql(client, tables);
    const seedSql = await buildSeedSql(client);

    writeFileSync(SCHEMA_FILE, schemaSql, 'utf8');
    writeFileSync(SEED_FILE, seedSql, 'utf8');

    console.log(`Generated schema baseline: ${SCHEMA_FILE}`);
    console.log(`Generated seed baseline: ${SEED_FILE}`);
  } finally {
    await client.end();
  }
}

async function loadTables(client: Client): Promise<string[]> {
  const { rows } = await client.query<TableRow>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  return rows
    .map((row) => row.table_name)
    .filter((tableName) => !INTERNAL_TABLES.has(tableName));
}

async function buildSchemaSql(client: Client, tables: string[]): Promise<string> {
  const statements: string[] = [];

  for (const tableName of tables) {
    const columns = await loadColumns(client, tableName);
    const constraints = await loadConstraints(client, tableName);
    const indexes = await loadIndexes(client, tableName, constraints);

    const definitions = [
      ...columns.map((column) => `  ${formatColumn(column)}`),
      ...constraints.map((constraint) => `  ${formatConstraint(constraint)}`),
    ];

    statements.push(`CREATE TABLE IF NOT EXISTS ${tableName} (\n${definitions.join(',\n')}\n);`);

    for (const index of indexes) {
      statements.push(normalizeIndexDef(index.indexdef) + ';');
    }
  }

  return statements.join('\n\n') + '\n';
}

async function buildSeedSql(client: Client): Promise<string> {
  const statements: string[] = ['BEGIN;'];

  for (const tableName of SEED_TABLES) {
    const columns = await loadColumnNames(client, tableName);
    const orderBy = buildOrderBy(tableName, columns);
    const { rows } = await client.query<Record<string, SeedValue>>(
      `SELECT * FROM ${tableName}${orderBy}`,
    );

    if (rows.length === 0) {
      continue;
    }

    const values = rows.map((row) => {
      const rowValues = columns.map((columnName) => formatSeedValue(row[columnName]));
      return `  (${rowValues.join(', ')})`;
    });

    statements.push(
      `INSERT INTO ${tableName} (${columns.join(', ')})\nVALUES\n${values.join(',\n')}\nON CONFLICT DO NOTHING;`,
    );
  }

  statements.push('COMMIT;');
  return statements.join('\n\n') + '\n';
}

async function loadColumns(client: Client, tableName: string): Promise<ColumnRow[]> {
  const { rows } = await client.query<ColumnRow>(
    `
    SELECT
      column_name,
      is_nullable,
      data_type,
      udt_name,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      datetime_precision,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
    `,
    [tableName],
  );

  return rows;
}

async function loadConstraints(client: Client, tableName: string): Promise<ConstraintRow[]> {
  const { rows } = await client.query<ConstraintRow>(
    `
    SELECT
      tc.constraint_name,
      tc.constraint_type,
      string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name = kcu.constraint_name
     AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = $1
      AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
    GROUP BY tc.constraint_name, tc.constraint_type
    ORDER BY
      CASE tc.constraint_type
        WHEN 'PRIMARY KEY' THEN 0
        ELSE 1
      END,
      tc.constraint_name
    `,
    [tableName],
  );

  return rows;
}

async function loadIndexes(
  client: Client,
  tableName: string,
  constraints: ConstraintRow[],
): Promise<IndexRow[]> {
  const constraintNames = new Set(constraints.map((constraint) => constraint.constraint_name));
  const { rows } = await client.query<IndexRow>(
    `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = $1
    ORDER BY indexname
    `,
    [tableName],
  );

  return rows.filter((row) => !constraintNames.has(row.indexname) && !row.indexname.endsWith('_pkey'));
}

async function loadColumnNames(client: Client, tableName: string): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
    `,
    [tableName],
  );

  return rows.map((row) => row.column_name);
}

function formatColumn(column: ColumnRow): string {
  const parts = [column.column_name, formatColumnType(column)];

  if (column.column_default) {
    parts.push(`DEFAULT ${column.column_default}`);
  }

  if (column.is_nullable === 'NO') {
    parts.push('NOT NULL');
  }

  return parts.join(' ');
}

function formatColumnType(column: ColumnRow): string {
  if (column.data_type === 'character varying') {
    return `varchar(${column.character_maximum_length ?? 255})`;
  }

  if (column.data_type === 'timestamp without time zone') {
    const precision = column.datetime_precision ?? 6;
    return `timestamp(${precision}) without time zone`;
  }

  if (column.data_type === 'numeric') {
    const precision = column.numeric_precision ?? 10;
    const scale = column.numeric_scale ?? 0;
    return `numeric(${precision},${scale})`;
  }

  if (column.data_type === 'USER-DEFINED' && column.udt_name === 'jsonb') {
    return 'jsonb';
  }

  return column.data_type;
}

function formatConstraint(constraint: ConstraintRow): string {
  if (constraint.constraint_type === 'PRIMARY KEY') {
    return `CONSTRAINT ${constraint.constraint_name} PRIMARY KEY (${constraint.columns})`;
  }

  return `CONSTRAINT ${constraint.constraint_name} UNIQUE (${constraint.columns})`;
}

function normalizeIndexDef(indexDef: string): string {
  return indexDef.replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ');
}

function formatSeedValue(value: SeedValue): string {
  if (value === null) {
    return 'NULL';
  }

  if (value instanceof Date) {
    return `'${escapeSql(value.toISOString())}'`;
  }

  if (typeof value === 'string') {
    return `'${escapeSql(value)}'`;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  return `'${escapeSql(JSON.stringify(value))}'::jsonb`;
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function buildOrderBy(tableName: string, columns: string[]): string {
  const preferred = [
    tableName === 'system_role_permissions' ? 'permission_id' : null,
    tableName === 'system_admin_roles' ? 'role_id' : null,
    columns.includes('sort') ? 'sort' : null,
    columns.includes('code') ? 'code' : null,
    columns.includes('dictionary_code') ? 'dictionary_code' : null,
    columns.includes('label') ? 'label' : null,
    columns.includes('config_key') ? 'config_key' : null,
    columns.includes('id') ? 'id' : null,
  ].filter((value): value is string => Boolean(value));

  return preferred.length > 0 ? ` ORDER BY ${preferred.join(', ')}` : '';
}

function resolveDbUrl(): string {
  const explicit =
    process.env.DB_RESET_URL
    || process.env.DB_MIGRATION_URL
    || process.env.DB_SEED_URL
    || process.env.DB_URL;

  if (explicit?.trim()) {
    return explicit;
  }

  throw new Error(
    'No database URL found. Set DB_RESET_URL, DB_MIGRATION_URL, DB_SEED_URL, or DB_URL.',
  );
}

void main();
