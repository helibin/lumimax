import type { CanActivate, ExecutionContext} from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser, UserType } from './auth.types';
import { USER_TYPE_KEY } from './user-type.decorator';

void Reflector;

@Injectable()
export class UserTypeGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector: Reflector) {
    this.reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredType = this.reflector.getAllAndOverride<UserType | undefined>(
      USER_TYPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredType) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (request.user?.type !== requiredType) {
      throw new ForbiddenException(`${requiredType}-side user required`);
    }

    return true;
  }
}
