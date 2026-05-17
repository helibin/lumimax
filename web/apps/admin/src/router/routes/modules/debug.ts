import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'carbon:debug',
      order: 25,
      title: $t('debug.groupTitle'),
    },
    name: 'DebugCenter',
    path: '/debug',
    children: [
      {
        path: '/debug/workbench',
        name: 'DebugCenterWorkbench',
        meta: {
          icon: 'carbon:application-web',
          order: 1,
          title: $t('debug.workbenchTitle'),
        },
        component: () => import('#/views/debug-center/index.vue'),
      },
    ],
  },
];

export default routes;
