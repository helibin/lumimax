import { requestClient } from '#/api/request';

export interface DashboardOverview {
  activeUserTotal: number;
  adminUserTotal: number;
  deviceTotal: number;
  onlineDeviceTotal: number;
  permissionTotal: number;
  roleTotal: number;
  systemServiceStatus: string;
  todayMealTotal: number;
  todayNewUsers: number;
  todayRecognitionFailedTotal: number;
  todayRecognitionTotal: number;
  userTotal: number;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return Number(value);
  }
  return 0;
}

export async function getDashboardOverviewApi(): Promise<DashboardOverview> {
  const response = await requestClient.get<Record<string, unknown>>('/admin/dashboard/overview');
  return {
    activeUserTotal: toNumber(response.activeUserTotal),
    adminUserTotal: toNumber(response.adminUserTotal),
    deviceTotal: toNumber(response.deviceTotal),
    onlineDeviceTotal: toNumber(response.onlineDeviceTotal),
    permissionTotal: toNumber(response.permissionTotal),
    roleTotal: toNumber(response.roleTotal),
    systemServiceStatus:
      typeof response.systemServiceStatus === 'string' ? response.systemServiceStatus : 'ok',
    todayMealTotal: toNumber(response.todayMealTotal),
    todayNewUsers: toNumber(response.todayNewUsers),
    todayRecognitionFailedTotal: toNumber(response.todayRecognitionFailedTotal),
    todayRecognitionTotal: toNumber(response.todayRecognitionTotal),
    userTotal: toNumber(response.userTotal),
  };
}
