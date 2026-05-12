import { SetMetadata } from '@nestjs/common';

export const ADMIN_PERMISSION_KEY = 'admin:permission';

export const AdminPermission = (permission: string) =>
  SetMetadata(ADMIN_PERMISSION_KEY, permission);
