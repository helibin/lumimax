import { registerAs } from '@nestjs/config';

export const appConfigToken = 'app';

export interface AppConfigValues {
  serviceName: string;
  nodeEnv: string;
  isDevelopment: boolean;
  logLevel: string;
  defaultTenantId: string;
  ports: {
    gateway: number;
    userService: number;
    notificationService: number;
    deviceService: number;
    iotBridgeService: number;
  };
}

export const AppConfig = registerAs(
  appConfigToken,
  (): AppConfigValues => {
    const serviceName = process.env.SERVICE_NAME ?? 'unknown-service';
    const currentHttpPort = Number(process.env.HTTP_PORT ?? Number.NaN);
    const resolvePort = (owner: string, fallback: number): number => {
      if (serviceName === owner && Number.isFinite(currentHttpPort)) {
        return currentHttpPort;
      }
      return fallback;
    };

    return {
      serviceName,
      nodeEnv: process.env.NODE_ENV ?? 'development',
      isDevelopment: (process.env.NODE_ENV ?? 'development') === 'development',
      logLevel: process.env.LOG_LEVEL ?? 'info',
      defaultTenantId: process.env.DEFAULT_TENANT_ID?.trim() || 'tenant000000000000000',
      ports: {
        gateway: resolvePort('gateway', 4000),
        userService: resolvePort('user-service', 4001),
        notificationService: resolvePort('notification-service', 4002),
        deviceService: resolvePort('device-service', 4010),
        iotBridgeService: resolvePort('iot-bridge-service', 4011),
      },
    };
  },
);

export function getDefaultTenantId(): string {
  return process.env.DEFAULT_TENANT_ID?.trim() || 'tenant000000000000000';
}
