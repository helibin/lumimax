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

### Diet admin menus

- `20260516180000_diet_admin_menus_seed.sql` — 后台「营养业务」目录及子菜单：
  - 餐次记录（`meal:view` → `/diet/meal-records`）
  - 识别日志（`recognition-log:view` → `/diet/recognition-logs`）
- `20260516181000_remove_diet_weighing_menu_seed.sql` — 删除已废弃的「称重记录」菜单（早期占位，无 gateway API）。
- 为 `super_admin` 绑定饮食菜单；为 `operator` 绑定餐次 + 识别日志只读权限与菜单。
- 新环境执行：`pnpm db:setup` 或先 migrate 再 `pnpm db:seed`。

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

### Checksum mismatch（已执行过的 seed 被改过）

报错：`Checksum mismatch for seed xxx.sql. File changed after applied.`

原因：`schema_seeds` 里记录了文件 SHA256，**已应用的 seed 不应再改内容**（应新增独立 seed 做增量变更）。

处理：

1. **推荐**：恢复该 seed 文件为首次执行时的内容，再 `pnpm db:seed`（仅会跑未应用的 seed）。
2. 若确需保留对旧 seed 文件的修改，在 `api` 目录更新库内 checksum（不会重跑 SQL）：

```bash
pnpm exec cross-env NODE_ENV=development node --import tsx scripts/db/fix-seed-checksum.ts 20260503101000
pnpm db:seed
```

图标修复请用 `20260516200000_fix_carbon_menu_icons_seed.sql`，不要改 `init_platform_seed.sql`。
