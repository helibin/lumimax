-- 饮食中心：自建食物库、用户沉淀数据菜单
-- 依赖：20260516180000_diet_admin_menus_seed.sql、food:view 权限

BEGIN;

INSERT INTO system_menus (
  id, creator_id, editor_id, is_disabled, remark,
  code, name, parent_id, menu_type, route_path, component, icon, permission_code,
  sort, visible, keep_alive, external_link, status, extra_json,
  created_at, updated_at, deleted_at, tenant_id
)
VALUES
  (
    '01kv7menu000000000000000020',
    NULL, NULL, FALSE, NULL,
    'DietInternalFoods', '自建食物库', '01kv7menu000000000000000017', 'menu',
    '/diet/internal-foods', '/diet/internal-food/list', 'mdi:database-outline', 'food:view',
    153, TRUE, TRUE, NULL, 'active', NULL,
    NOW(), NOW(), NULL, NULL
  ),
  (
    '01kv7menu000000000000000021',
    NULL, NULL, FALSE, NULL,
    'DietUserCommonFoods', '用户沉淀数据', '01kv7menu000000000000000017', 'menu',
    '/diet/user-common-foods', '/diet/user-common-food/list', 'mdi:account-heart-outline', 'food:view',
    154, TRUE, TRUE, NULL, 'active', NULL,
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

INSERT INTO system_role_menus (
  id, creator_id, editor_id, is_disabled, remark, role_id, menu_id,
  assigned_at, created_at, updated_at, deleted_at, tenant_id
)
VALUES
  ('01kv7rm000000000000000000024', NULL, NULL, FALSE, NULL, '01kv7role000000000000000001', '01kv7menu000000000000000020', NOW(), NOW(), NOW(), NULL, NULL),
  ('01kv7rm000000000000000000025', NULL, NULL, FALSE, NULL, '01kv7role000000000000000001', '01kv7menu000000000000000021', NOW(), NOW(), NOW(), NULL, NULL),
  ('01kv7rm000000000000000000026', NULL, NULL, FALSE, NULL, '01kv7role000000000000000002', '01kv7menu000000000000000020', NOW(), NOW(), NOW(), NULL, NULL),
  ('01kv7rm000000000000000000027', NULL, NULL, FALSE, NULL, '01kv7role000000000000000002', '01kv7menu000000000000000021', NOW(), NOW(), NOW(), NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_role_permissions (
  id, creator_id, editor_id, is_disabled, remark, role_id, permission_id,
  assigned_at, created_at, updated_at, deleted_at, tenant_id
)
VALUES
  ('01kv7rp000000000000000000001012', NULL, NULL, FALSE, NULL, '01kv7role000000000000000002', '01kv7perm000000000000000011', NOW(), NOW(), NOW(), NULL, NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;
