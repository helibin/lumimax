import type { CanActivate, ExecutionContext} from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import type { AuthenticatedUser } from './auth.types';

void Reflector;

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector: Reflector) {
    this.reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const granted = new Set(request.user?.permissions ?? []);
    const allowed = requiredPermissions.every((permission: string) =>
      granted.has(permission),
    );
    if (!allowed) {
      throw new ForbiddenException('Missing required permissions');
    }

    return true;
  }
}
