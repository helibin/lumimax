-- 修复 Carbon 菜单图标名（device-mobile / document-audit 在 Iconify Carbon 集中不存在）
BEGIN;

UPDATE system_menus
SET icon = 'carbon:devices', updated_at = NOW()
WHERE icon = 'carbon:device-mobile'
   OR id = '01kv7menu000000000000000003';

UPDATE system_menus
SET icon = 'carbon:document-view', updated_at = NOW()
WHERE icon = 'carbon:document-audit'
   OR id = '01kv7menu000000000000000016';

COMMIT;
