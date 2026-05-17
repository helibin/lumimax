import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { UserType } from '@lumimax/auth';
import type { AuthenticatedUser } from '@lumimax/auth';
import { JwtTokenService } from '@lumimax/auth';
import { generateRequestId } from '@lumimax/runtime';
import { AdminAuthService } from './admin-auth.service';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    @Inject(JwtTokenService) private readonly jwtTokenService: JwtTokenService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      requestId?: string;
      user?: AuthenticatedUser;
    }>();
    const authorization = request.headers?.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwtTokenService.verify<AuthenticatedUser>(
        authorization.slice(7).trim(),
      );
      if (payload.type !== UserType.INTERNAL) {
        throw new UnauthorizedException('Admin token required');
      }
      if (!payload.userId) {
        throw new UnauthorizedException('Invalid bearer token');
      }
      const requestId =
        request.requestId
        ?? (typeof request.headers?.['x-request-id'] === 'string'
          ? request.headers['x-request-id']
          : generateRequestId());
      await this.adminAuthService.validateSession({
        requestId,
        adminId: payload.userId,
      });
      request.user = payload;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}
