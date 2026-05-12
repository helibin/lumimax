import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'mdi:food-apple',
      order: 30,
      title: $t('diet.groupTitle'),
    },
    name: 'Diet',
    path: '/diet',
    children: [
      {
        path: '/diet/weighing-records',
        name: 'DietWeighingRecords',
        meta: {
          icon: 'mdi:scale-bathroom',
          title: $t('diet.title'),
        },
        component: () => import('#/views/diet/weighing-record/list.vue'),
      },
    ],
  },
];

export default routes;
