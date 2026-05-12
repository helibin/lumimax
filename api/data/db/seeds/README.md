<!--
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-22 18:16:07
 * @LastEditTime: 2026-04-24 01:41:47
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/db/seeds/README.md
-->
# Database Seeds

## Naming

- File format: `<timestamp>_<name>.sql`
- Example: `20260501001000_init_platform_seed.sql`

## Commands

- `pnpm db:seed` apply pending seed files
- `pnpm db:seed:status` show applied/pending seed files
- `pnpm db:seed:create init_demo_data` create a new seed file template
- `pnpm db:reset` drop and recreate the `public` schema
- `pnpm db:setup` apply migrations first, then seeds
- `pnpm db:reinit` reset schema first, then apply migrations and seeds

## Baseline

- Current clean baseline seed: `20260503101000_init_platform_seed.sql`
- Includes system permissions, roles, dictionaries, configs, notification templates, and the default admin account.
- The web admin initialization flow only applies baseline system seeds such as `*_init_platform_seed.sql` or `*_init_core_seed.sql`.
- Business/demo seeds should be added as separate files and executed manually when needed.

## DB URL resolution

Priority:

1. `DB_SEED_URL`
2. `DB_MIGRATION_URL`
3. `DB_URL`

Or specify target:

- `pnpm db:seed -- --target=user`
- `pnpm db:seed -- --target=notification`
- `pnpm db:seed -- --target=device`
- `pnpm db:seed -- --target=storage`

## Notes

- Seed execution history is stored in `public.schema_seeds`.
- Seed files should be idempotent so they can be re-applied safely in local environments.
