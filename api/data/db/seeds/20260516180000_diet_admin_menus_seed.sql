-- 饮食中心 Admin 菜单与角色授权（餐次记录、识别日志）
-- 依赖：20260503101000_init_platform_seed.sql（权限 meal:view / recognition-log:view 已存在）
-- 执行：pnpm db:seed  或  pnpm db:setup

BEGIN;

-- 营养业务目录（sort=150，介于设备 100 与通知 200）
INSERT INTO system_menus (
  id, creator_id, editor_id, is_disabled, remark,
  code, name, parent_id, menu_type, route_path, component, icon, permission_code,
  sort, visible, keep_alive, external_link, status, extra_json,
  created_at, updated_at, deleted_at, tenant_id
)
VALUES
  (
    '01kv7menu000000000000000017',
    NULL, NULL, FALSE, NULL,
    'Diet', '营养业务', NULL, 'catalog', '/diet', NULL, 'mdi:food-apple', NULL,
    150, TRUE, FALSE, NULL, 'active', NULL,
    NOW(), NOW(), NULL, NULL
  ),
  (
    '01kv7menu000000000000000018',
    NULL, NULL, FALSE, NULL,
    'DietMealRecords', '餐次记录', '01kv7menu000000000000000017', 'menu',
    '/diet/meal-records', '/diet/meal-record/list', 'mdi:silverware-fork-knife', 'meal:view',
    151, TRUE, TRUE, NULL, 'active', NULL,
    NOW(), NOW(), NULL, NULL
  ),
  (
    '01kv7menu000000000000000019',
    NULL, NULL, FALSE, NULL,
    'DietRecognitionLogs', '识别日志', '01kv7menu000000000000000017', 'menu',
    '/diet/recognition-logs', '/diet/recognition-log/list', 'mdi:eye-outline', 'recognition-log:view',
    152, TRUE, TRUE, NULL, 'active', NULL,
    NOW(), NOW(), NULL, NULL
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  parent_id = EXCLUDED.parent_id,
  menu_type = EXCLUDED.menu_type,
  route_path = EXCLUDED.route_path,
  component = EXCLUDED.component,
  icon = EXCLUDED.icon,
  permission_code = EXCLUDED.permission_code,
  sort = EXCLUDED.sort,
  visible = EXCLUDED.visible,
  keep_alive = EXCLUDED.keep_alive,
  status = EXCLUDED.status,
  updated_at = NOW();

-- 超级管理员：可见全部饮食菜单
INSERT INTO system_role_menus (
  id, creator_id, editor_id, is_disabled, remark, role_id, menu_id,
  assigned_at, created_at, updated_at, deleted_at, tenant_id
)
VALUES
  ('01kv7rm000000000000000000017', NULL, NULL, FALSE, NULL, '01kv7role000000000000000001', '01kv7menu000000000000000017', NOW(), NOW(), NOW(), NULL, NULL),
  ('01kv7rm000000000000000000018', NULL, NULL, FALSE, NULL, '01kv7role000000000000000001', '01kv7menu000000000000000018', NOW(), NOW(), NOW(), NULL, NULL),
  ('01kv7rm000000000000000000019', NULL, NULL, FALSE, NULL, '01kv7role000000000000000001', '01kv7menu000000000000000019', NOW(), NOW(), NOW(), NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- 运营人员：只读饮食数据（权限 + 菜单）
INSERT INTO system_role_permissions (
  id, creator_id, editor_id, is_disabled, remark, role_id, permission_id,
  assigned_at, created_at, updated_at, deleted_at, tenant_id
)
VALUES
  ('01kv7rp000000000000000000001010', NULL, NULL, FALSE, NULL, '01kv7role000000000000000002', '01kv7perm000000000000000010', NOW(), NOW(), NOW(), NULL, NULL),
  ('01kv7rp000000000000000000001011', NULL, NULL, FALSE, NULL, '01kv7role000000000000000002', '01kv7perm000000000000000014', NOW(), NOW(), NOW(), NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_role_menus (
  id, creator_id, editor_id, is_disabled, remark, role_id, menu_id,
  assigned_at, created_at, updated_at, deleted_at, tenant_id
)
VALUES
  ('01kv7rm000000000000000000021', NULL, NULL, FALSE, NULL, '01kv7role000000000000000002', '01kv7menu000000000000000017', NOW(), NOW(), NOW(), NULL, NULL),
  ('01kv7rm000000000000000000022', NULL, NULL, FALSE, NULL, '01kv7role000000000000000002', '01kv7menu000000000000000018', NOW(), NOW(), NOW(), NULL, NULL),
  ('01kv7rm000000000000000000023', NULL, NULL, FALSE, NULL, '01kv7role000000000000000002', '01kv7menu000000000000000019', NOW(), NOW(), NOW(), NULL, NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;
