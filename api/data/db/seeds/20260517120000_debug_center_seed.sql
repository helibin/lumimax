BEGIN;

INSERT INTO system_permissions (
  id, creator_id, editor_id, is_disabled, remark,
  code, name, group_code, description,
  created_at, updated_at, deleted_at, tenant_id
)
VALUES (
  '01kv7perm000000000000000099',
  NULL, NULL, FALSE, NULL,
  'debug:center:execute',
  '调试中心执行',
  'debug',
  '在后台调试中心测试设备通讯、上传与食物识别',
  NOW(), NOW(), NULL, NULL
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  group_code = EXCLUDED.group_code,
  description = EXCLUDED.description,
  updated_at = EXCLUDED.updated_at;

INSERT INTO system_menus (
  id, creator_id, editor_id, is_disabled, remark,
  code, name, parent_id, menu_type, route_path, component, icon, permission_code,
  sort, visible, keep_alive, external_link, status, extra_json,
  created_at, updated_at, deleted_at, tenant_id
)
VALUES
  (
    '01kv7menu000000000000000099',
    NULL, NULL, FALSE, NULL,
    'DebugCenter', '调试中心', NULL, 'catalog', '/debug', NULL, 'carbon:debug', NULL,
    150, TRUE, FALSE, NULL, 'active', NULL,
    NOW(), NOW(), NULL, NULL
  ),
  (
    '01kv7menu000000000000000100',
    NULL, NULL, FALSE, NULL,
    'DebugCenterWorkbench', '联调工作台', '01kv7menu000000000000000099', 'menu',
    '/debug/workbench', '/debug-center/index', 'carbon:application-web', 'debug:center:execute',
    151, TRUE, TRUE, NULL, 'active', NULL,
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
  updated_at = EXCLUDED.updated_at;

INSERT INTO system_role_permissions (
  id, creator_id, editor_id, is_disabled, remark,
  role_id, permission_id, assigned_at, created_at, updated_at, deleted_at, tenant_id
)
SELECT
  '01kv7rp0000000000000000000099',
  NULL, NULL, FALSE, NULL,
  '01kv7role000000000000000001',
  '01kv7perm000000000000000099',
  NOW(), NOW(), NOW(), NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM system_role_permissions
  WHERE role_id = '01kv7role000000000000000001'
    AND permission_id = '01kv7perm000000000000000099'
    AND deleted_at IS NULL
);

COMMIT;
