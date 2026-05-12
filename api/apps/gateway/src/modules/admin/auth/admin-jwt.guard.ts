import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { UserType } from '@lumimax/auth';
import type { AuthenticatedUser } from '@lumimax/auth';
import { JwtTokenService } from '@lumimax/auth';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(@Inject(JwtTokenService) private readonly jwtTokenService: JwtTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
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
