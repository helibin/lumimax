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
        path: '/diet/meal-records',
        name: 'DietMealRecords',
        meta: {
          icon: 'mdi:silverware-fork-knife',
          title: $t('diet.mealTitle'),
        },
        component: () => import('#/views/diet/meal-record/list.vue'),
      },
      {
        path: '/diet/recognition-logs',
        name: 'DietRecognitionLogs',
        meta: {
          icon: 'mdi:eye-outline',
          title: $t('diet.recognitionTitle'),
        },
        component: () => import('#/views/diet/recognition-log/list.vue'),
      },
      {
        path: '/diet/internal-foods',
        name: 'DietInternalFoods',
        meta: {
          icon: 'mdi:database-outline',
          title: $t('diet.internalFoodTitle'),
        },
        component: () => import('#/views/diet/internal-food/list.vue'),
      },
      {
        path: '/diet/user-common-foods',
        name: 'DietUserCommonFoods',
        meta: {
          icon: 'mdi:account-heart-outline',
          title: $t('diet.userCommonFoodTitle'),
        },
        component: () => import('#/views/diet/user-common-food/list.vue'),
      },
    ],
  },
];

export default routes;
