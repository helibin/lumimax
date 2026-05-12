import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'carbon:notification',
      order: 30,
      title: $t('notification.groupTitle'),
    },
    name: 'Notification',
    path: '/notification',
    children: [
      {
        path: '/notification/message',
        name: 'NotificationMessage',
        meta: {
          icon: 'carbon:notification-new',
          title: $t('notification.messageTitle'),
        },
        component: () => import('#/views/notification/message/list.vue'),
      },
      {
        path: '/notification/template',
        name: 'NotificationTemplate',
        meta: {
          icon: 'carbon:template',
          title: $t('notification.templateTitle'),
        },
        component: () => import('#/views/notification/template/list.vue'),
      },
      {
        path: '/notification/device-token',
        name: 'NotificationDeviceToken',
        meta: {
          icon: 'carbon:mobile',
          title: $t('notification.deviceTokenTitle'),
        },
        component: () => import('#/views/notification/device-token/list.vue'),
      },
    ],
  },
];

export default routes;
