-- 移除已废弃的「称重记录」后台菜单（无后端 API，由餐次记录 + 识别日志替代）
BEGIN;

DELETE FROM system_role_menus
WHERE menu_id = '01kv7menu000000000000000020';

DELETE FROM system_menus
WHERE id = '01kv7menu000000000000000020'
   OR code = 'DietWeighingRecords';

COMMIT;
