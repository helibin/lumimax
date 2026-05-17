import type { ComponentRecordType, GenerateMenuAndRoutesOptions } from '@lumimax/types';
import type { RouteRecordStringComponent } from '@lumimax/types';
import type { RouteRecordRaw } from 'vue-router';

import { generateAccessible } from '@lumimax/access';

import { message } from 'ant-design-vue';

import { getAllMenusApi } from '#/api';
import { BasicLayout, IFrameView } from '#/layouts';
import { $t } from '#/locales';

const forbiddenComponent = () => import('#/views/_core/fallback/forbidden.vue');

/** 后端菜单模式下仍从本地 routes 注入（DB seed 未执行时也能看到） */
function mergeStaticDebugRoutes(
  remoteRoutes: RouteRecordStringComponent[],
  localRoutes: RouteRecordRaw[],
): RouteRecordStringComponent[] {
  const hasDebugMenu = remoteRoutes.some(
    (route) => route.name === 'DebugCenter' || route.path === '/debug',
  );
  if (hasDebugMenu) {
    return remoteRoutes;
  }
  const debugCatalog = localRoutes.find((route) => route.name === 'DebugCenter');
  if (!debugCatalog) {
    return remoteRoutes;
  }
  return [...remoteRoutes, debugCatalog as RouteRecordStringComponent];
}

async function generateAccess(options: GenerateMenuAndRoutesOptions) {
  const pageMap: ComponentRecordType = import.meta.glob('../views/**/*.vue');

  const layoutMap: ComponentRecordType = {
    BasicLayout,
    IFrameView,
  };

  // Force backend mode for admin app to always fetch menu routes from gateway.
  return await generateAccessible('backend', {
    ...options,
    fetchMenuListAsync: async () => {
      message.loading({
        content: `${$t('common.loadingMenu')}...`,
        duration: 1.5,
      });
      const remoteRoutes = await getAllMenusApi();
      const localRoutes = (options.routes ?? []) as RouteRecordRaw[];
      if (remoteRoutes.length > 0) {
        return mergeStaticDebugRoutes(remoteRoutes, localRoutes);
      }
      return localRoutes as RouteRecordStringComponent[];
    },
    // 可以指定没有权限跳转403页面
    forbiddenComponent,
    // 如果 route.meta.menuVisibleWithForbidden = true
    layoutMap,
    pageMap,
  });
}

export { generateAccess };
