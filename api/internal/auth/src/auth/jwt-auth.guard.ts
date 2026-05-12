import type {
  CanActivate,
  ExecutionContext} from '@nestjs/common';
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtTokenService } from '../jwt/jwt-token.service';
import type { AuthenticatedUser } from './auth.types';

void JwtTokenService;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtTokenService: JwtTokenService;

  constructor(jwtTokenService: JwtTokenService) {
    this.jwtTokenService = jwtTokenService;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();
    const authorization = request.headers?.authorization;

    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = await this.jwtTokenService.verify<AuthenticatedUser>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}
