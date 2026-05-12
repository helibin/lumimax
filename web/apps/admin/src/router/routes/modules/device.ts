import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'mdi:devices',
      order: 20,
      title: $t('device.groupTitle'),
    },
    name: 'Device',
    path: '/device',
    children: [
      {
        path: '/device/ota',
        name: 'DeviceOta',
        meta: {
          icon: 'mdi:update',
          title: $t('ota.title'),
        },
        component: () => import('#/views/device/ota/list.vue'),
      },
      {
        path: '/device/list',
        name: 'DeviceList',
        meta: {
          icon: 'mdi:cellphone-cog',
          title: $t('device.title'),
        },
        component: () => import('#/views/device/list/index.vue'),
      },
    ],
  },
];

export default routes;
