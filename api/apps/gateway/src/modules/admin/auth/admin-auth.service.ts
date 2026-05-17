import { Inject, Injectable } from '@nestjs/common';
import { JwtTokenService, UserType } from '@lumimax/auth';
import { BaseSystemAdminGrpcAdapter } from '../../../grpc/base-service.grpc-client';
import { GrpcInvokerService } from '../../grpc-invoker.service';

interface AdminProfile {
  id: string;
  username: string;
  nickname: string;
  email?: string;
  phone?: string;
  status?: string;
  roles?: string[];
  permissions?: string[];
  last_login_at?: string;
  lastLoginAt?: string;
}

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(JwtTokenService) private readonly jwtTokenService: JwtTokenService,
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseSystemAdminGrpcAdapter)
    private readonly baseSystemAdminGrpcAdapter: BaseSystemAdminGrpcAdapter,
  ) {}

  async login(input: {
    requestId: string;
    username: string;
    password: string;
  }): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const reply = await this.grpcInvoker.invoke<{ user: AdminProfile }>({
      requestId: input.requestId,
      service: 'base-service',
      operation: 'admin.auth.login',
      call: () => this.baseSystemAdminGrpcAdapter.call<{ user: AdminProfile }>(
        'auth',
        'Login',
        {
          username: input.username,
          password: input.password,
        },
        input.requestId,
      ),
    });
    const user = this.toAdminUser(reply.user);
    const accessToken = await this.jwtTokenService.sign({
      userId: user.id,
      type: UserType.INTERNAL,
      roles: user.roles,
      permissions: user.permissions,
      tenantId: null,
    });
    return { accessToken, user };
  }

  async validateSession(input: { requestId: string; adminId: string }): Promise<void> {
    await this.grpcInvoker.invoke<{ ok?: boolean }>({
      requestId: input.requestId,
      service: 'base-service',
      operation: 'admin.auth.validate-session',
      call: () =>
        this.baseSystemAdminGrpcAdapter.call<{ ok?: boolean }>(
          'auth',
          'ValidateSession',
          { admin_id: input.adminId },
          input.requestId,
        ),
    });
  }

  async me(input: { requestId: string; adminId: string }): Promise<Record<string, unknown>> {
    const reply = await this.grpcInvoker.invoke<{ user: AdminProfile }>({
      requestId: input.requestId,
      service: 'base-service',
      operation: 'admin.auth.me',
      call: () => this.baseSystemAdminGrpcAdapter.call<{ user: AdminProfile }>(
        'auth',
        'GetMe',
        { admin_id: input.adminId },
        input.requestId,
      ),
    });
    return this.toAdminUser(reply.user);
  }

  async getInitStatus(input: { requestId: string }): Promise<Record<string, unknown>> {
    return this.grpcInvoker.invoke<Record<string, unknown>>({
      requestId: input.requestId,
      service: 'base-service',
      operation: 'admin.auth.get-init-status',
      call: () =>
        this.baseSystemAdminGrpcAdapter.call<Record<string, unknown>>(
          'auth',
          'GetInitStatus',
          {},
          input.requestId,
        ),
    });
  }

  async initialize(input: {
    requestId: string;
    username: string;
    password: string;
    nickname: string;
    email?: string;
    usageMode?: string;
  }): Promise<Record<string, unknown>> {
    return this.grpcInvoker.invoke<Record<string, unknown>>({
      requestId: input.requestId,
      service: 'base-service',
      operation: 'admin.auth.initialize-system',
      call: () =>
        this.baseSystemAdminGrpcAdapter.call<Record<string, unknown>>(
          'auth',
          'InitializeSystem',
          {
            username: input.username,
            password: input.password,
            nickname: input.nickname,
            email: input.email ?? '',
            usage_mode: input.usageMode ?? 'default',
          },
          input.requestId,
        ),
    });
  }

  private toAdminUser(profile: AdminProfile): Record<string, unknown> {
    return {
      id: profile.id,
      username: profile.username,
      nickname: profile.nickname,
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      status: profile.status ?? '',
      roles: profile.roles ?? [],
      permissions: profile.permissions ?? [],
      lastLoginAt: profile.lastLoginAt ?? profile.last_login_at ?? '',
    };
  }

}
