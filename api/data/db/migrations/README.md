<!--
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-22 02:30:31
 * @LastEditTime: 2026-04-24 01:44:38
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/db/migrations/README.md
-->
# Database Migrations

## Naming

- File format: `<timestamp>_<name>.sql`
- Example: `20260501000000_init_platform_schema.sql`

## Commands

- `pnpm db:migrate` apply pending migrations
- `pnpm db:migrate:status` show applied/pending migrations
- `pnpm db:migration:create add_xxx_table` create a new migration file template

## Baseline

- Current clean baseline: `20260503100000_init_platform_schema.sql`
- The baseline directly matches the active `gateway + base-service + biz-service` data model.
- Old compatibility migrations were removed and are no longer maintained.

## DB URL resolution

Priority:

1. `DB_MIGRATION_URL`
2. `DB_URL`

Or specify target:

- `pnpm db:migrate -- --target=user`
- `pnpm db:migrate -- --target=notification`
- `pnpm db:migrate -- --target=device`
- `pnpm db:migrate -- --target=storage`
- `pnpm db:migrate -- --target=iot`
