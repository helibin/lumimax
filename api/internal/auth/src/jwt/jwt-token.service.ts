import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

void JwtService;

@Injectable()
export class JwtTokenService {
  private readonly jwtService: JwtService;

  constructor(jwtService: JwtService) {
    this.jwtService = jwtService;
  }

  sign(payload: Record<string, unknown>): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  verify<T extends object = Record<string, unknown>>(token: string): Promise<T> {
    return this.jwtService.verifyAsync<T>(token);
  }
}
