import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@lumimax/auth';
import { ADMIN_PERMISSION_KEY } from './admin-permission.decorator';

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<string | undefined>(
      ADMIN_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    const permissions = new Set(user?.permissions ?? []);
    if (permissions.has('*') || permissions.has(permission)) {
      return true;
    }
    throw new ForbiddenException(`Missing required permission: ${permission}`);
  }
}
