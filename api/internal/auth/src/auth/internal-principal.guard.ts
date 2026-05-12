import type {
  CanActivate,
  ExecutionContext} from '@nestjs/common';
import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserType, type AuthenticatedUser } from './auth.types';

@Injectable()
export class InternalPrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Missing authenticated principal');
    }
    if (user.type !== UserType.INTERNAL) {
      throw new ForbiddenException('Internal admin principal required');
    }

    const hasIdentityBinding = (user.roles?.length ?? 0) > 0
      || (user.policies?.length ?? 0) > 0
      || (user.permissions?.length ?? 0) > 0;
    if (!hasIdentityBinding) {
      throw new ForbiddenException('Internal principal is missing role/policy binding');
    }

    return true;
  }
}
