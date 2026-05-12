import { SetMetadata } from '@nestjs/common';
import type { UserType } from './auth.types';

export const USER_TYPE_KEY = 'required_user_type';

export const RequireUserType = (type: UserType) =>
  SetMetadata(USER_TYPE_KEY, type);
