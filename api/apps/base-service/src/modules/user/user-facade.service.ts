import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createPagedResult,
} from '@lumimax/http-kit';
import type { AuthenticatedUser } from '@lumimax/auth';
import { JwtTokenService } from '@lumimax/auth';
import { generateId } from '@lumimax/runtime';
import { HashUtil } from '@lumimax/crypto-utils';
import type { GatewayGrpcReply } from '@lumimax/integration/grpc/gateway-grpc.util';
import { buildGatewayGrpcSuccess } from '@lumimax/integration/grpc/gateway-grpc.util';
import { getDefaultTenantId, getEnvString } from '@lumimax/config';
import type { EntityManager, Repository } from 'typeorm';
import {
  ConsentRecordEntity,
  PrivacyRequestEntity,
  RefreshTokenEntity,
  ThirdPartyIdentityEntity,
  UserEntity,
  UserType,
} from './user.entities';

@Injectable()
export class UserFacadeService {
  constructor(
    @Inject(JwtTokenService) private readonly jwtTokenService: JwtTokenService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
    @InjectRepository(ThirdPartyIdentityEntity)
    private readonly thirdPartyIdentityRepository: Repository<ThirdPartyIdentityEntity>,
    @InjectRepository(PrivacyRequestEntity)
    private readonly privacyRequestRepository: Repository<PrivacyRequestEntity>,
    @InjectRepository(ConsentRecordEntity)
    private readonly consentRecordRepository: Repository<ConsentRecordEntity>,
  ) {}

  async execute(input: {
    operation: string;
    paramsJson?: string;
    queryJson?: string;
    bodyJson?: string;
    userJson?: string;
    tenantScope?: string;
    requestId: string;
  }) {
    if (input.operation === 'identity.me') {
      return this.identityMe(input);
    }
    if (input.operation === 'identity.update') {
      return this.identityUpdate(input);
    }
    if (input.operation === 'auth.user.login') {
      return this.login(input);
    }
    if (input.operation === 'auth.user.register') {
      return this.register(input);
    }
    if (input.operation === 'auth.refresh') {
      return this.refresh(input);
    }
    if (input.operation === 'auth.logout') {
      return this.logout(input);
    }
    if (input.operation === 'auth.password.forgot.reset') {
      return this.forgotPasswordReset(input);
    }
    if (input.operation === 'auth.google.url') {
      return this.getGoogleAuthUrl(input);
    }
    if (input.operation === 'auth.google.callback') {
      return this.handleGoogleCallback(input);
    }
    if (input.operation === 'auth.wechat.login') {
      return this.wechatLogin(input);
    }
    if (input.operation === 'auth.apple.login') {
      return this.appleLogin(input);
    }
    if (input.operation === 'privacy.requests.export') {
      return this.createPrivacyRequest(input, 'export');
    }
    if (input.operation === 'privacy.requests.delete') {
      return this.createPrivacyRequest(input, 'delete');
    }
    if (input.operation === 'privacy.requests.revokeConsent') {
      return this.createPrivacyRequest(input, 'revoke-consent');
    }
    if (input.operation === 'privacy.requests.create') {
      return this.createPrivacyRequest(input);
    }
    if (input.operation === 'privacy.requests.list') {
      return this.listPrivacyRequests(input);
    }
    if (input.operation === 'privacy.consents.create') {
      return this.recordConsent(input);
    }
    if (input.operation === 'admin.users.list') {
      return this.adminListUsers(input);
    }
    if (input.operation === 'admin.users.get') {
      return this.adminGetUser(input);
    }
    if (input.operation === 'admin.users.update') {
      return this.adminUpdateUser(input);
    }
    if (input.operation === 'admin.users.create') {
      return this.adminCreateUser(input);
    }
    if (input.operation === 'admin.users.delete') {
      return this.adminDeleteUser(input);
    }
    throw new UnauthorizedException(`Unsupported user operation: ${input.operation}`);
  }

  private async identityMe(input: {
    userJson?: string;
  }): Promise<GatewayGrpcReply> {
    const user = parseJson<AuthenticatedUser | null>(input.userJson, null);
    const userId = requireUserId(user);
    const entity = await this.userRepository.findOne({ where: { id: userId } });
    if (!entity) {
      throw new NotFoundException('User not found');
    }
    return buildReply(
      {
        id: entity.id,
        username: entity.username,
        type: entity.type,
        status: entity.status,
        tenantId: entity.tenantId,
      },
      '',
    );
  }

  private async identityUpdate(input: {
    userJson?: string;
    bodyJson?: string;
    requestId: string;
  }) {
    const user = parseJson<AuthenticatedUser | null>(input.userJson, null);
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const userId = requireUserId(user);
    const entity = await this.userRepository.findOne({ where: { id: userId } });
    if (!entity) {
      throw new NotFoundException('User not found');
    }
    const username = pickString(body.username);
    if (username && username !== entity.username) {
      const duplicated = await this.userRepository.findOne({ where: { username } });
      if (duplicated && duplicated.id !== entity.id) {
        throw new Error('Username already exists');
      }
      entity.username = username;
      await this.userRepository.save(entity);
    }
    return buildReply(
      {
        id: entity.id,
        username: entity.username,
        type: entity.type,
        status: entity.status,
        tenantId: entity.tenantId,
      },
      input.requestId,
    );
  }

  private async logout(input: {
    bodyJson?: string;
    requestId: string;
  }) {
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const refreshToken = pickString(body.refreshToken);
    if (!refreshToken) {
      return buildReply({ loggedOut: true }, input.requestId);
    }

    const tokenHash = sha256(refreshToken);
    const record = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });
    if (!record || record.status !== 'ACTIVE') {
      return buildReply({ loggedOut: true }, input.requestId);
    }

    record.status = 'REVOKED';
    record.revokedAt = new Date();
    await this.refreshTokenRepository.save(record);
    return buildReply({ loggedOut: true }, input.requestId);
  }

  private async forgotPasswordReset(input: {
    bodyJson?: string;
    requestId: string;
  }) {
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const verifyType = pickVerifyType(body.verifyType);
    const account = pickString(body.account);
    const verifyCode = pickString(body.verifyCode);
    const newPassword = pickString(body.newPassword);
    if (!verifyType) {
      throw new Error('verifyType must be one of phone or email');
    }
    if (!account) {
      throw new Error('account is required');
    }
    if (!verifyCode || !/^\d{6}$/.test(verifyCode)) {
      throw new Error('verifyCode must be a 6-digit numeric string');
    }
    if (!newPassword) {
      throw new Error('newPassword is required');
    }

    const user = await this.userRepository.findOne({
      where: {
        username: account.trim(),
        type: UserType.CUSTOMER,
      },
    });
    if (!user) {
      throw new NotFoundException('User not registered');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is disabled');
    }

    user.passwordHash = encodePasswordByUserId(user.id, newPassword);
    await this.userRepository.save(user);

    await this.refreshTokenRepository
      .createQueryBuilder()
      .update(RefreshTokenEntity)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
      })
      .where('user_id = :userId', { userId: user.id })
      .andWhere('status = :status', { status: 'ACTIVE' })
      .execute();

    await writeUserAuditLog(this.userRepository.manager, {
      requestId: input.requestId,
      actorUserId: user.id,
      actorType: toAuditActorType(user.type),
      action: 'auth.password.forgot.reset',
      resourceType: 'User',
      resourceId: user.id,
      metadata: {
        verifyType,
        account: account.trim(),
      },
    });

    return buildReply({ reset: true }, input.requestId);
  }

  private async getGoogleAuthUrl(input: { requestId: string }) {
    const state = `state_${generateId()}`;
    const callbackUrl =
      getEnvString('GOOGLE_CALLBACK_URL', 'http://localhost:4001/auth/google/callback')
      ?? 'http://localhost:4001/auth/google/callback';
    const clientId = getEnvString('GOOGLE_CLIENT_ID', 'google-client-id') ?? 'google-client-id';
    const redirectUri = encodeURIComponent(callbackUrl);
    const scope = encodeURIComponent('openid profile email');
    const url =
      'https://accounts.google.com/o/oauth2/v2/auth'
      + `?client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${redirectUri}`
      + '&response_type=code'
      + `&scope=${scope}`
      + `&state=${encodeURIComponent(state)}`;

    return buildReply({ url, state }, input.requestId);
  }

  private async handleGoogleCallback(input: {
    queryJson?: string;
    requestId: string;
  }) {
    const query = parseJson<Record<string, unknown>>(input.queryJson, {});
    const code = pickString(query.code);
    const state = pickString(query.state);
    if (!code || !state) {
      throw new Error('code and state are required');
    }
    return buildReply(
      {
        code,
        state,
        message: 'reserved-for-next-phase',
      },
      input.requestId,
    );
  }

  private async wechatLogin(input: {
    bodyJson?: string;
    requestId: string;
  }) {
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    return this.loginByThirdParty({
      provider: 'wechat',
      providerUserId: pickString(body.providerUserId),
      unionId: pickString(body.unionId) ?? null,
      openId: pickString(body.openId) ?? null,
      email: pickString(body.email) ?? null,
      metadata: pickObject(body.metadata) ?? {},
      requestId: input.requestId,
    });
  }

  private async appleLogin(input: {
    bodyJson?: string;
    requestId: string;
  }) {
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    return this.loginByThirdParty({
      provider: 'apple',
      providerUserId: pickString(body.providerUserId),
      unionId: null,
      openId: null,
      email: pickString(body.email) ?? null,
      metadata: {
        identityToken: pickString(body.identityToken) ?? null,
        authorizationCode: pickString(body.authorizationCode) ?? null,
        ...(pickObject(body.metadata) ?? {}),
      },
      requestId: input.requestId,
    });
  }

  private async login(input: {
    bodyJson?: string;
    requestId: string;
  }) {
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const username = pickString(body.username);
    const password = pickString(body.password);
    if (!username || !password) {
      throw new Error('username and password are required');
    }

    const entity = await this.userRepository.findOne({
      where: {
        username,
        type: UserType.CUSTOMER,
      },
    });
    if (!entity) {
      throw new NotFoundException('User not registered');
    }
    if (entity.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is disabled');
    }

    const normalizedPassword = normalizeMd5Password(password);
    const encoded = encodePasswordByUserId(entity.id, normalizedPassword);
    if (entity.passwordHash !== encoded) {
      const legacyEncoded = HashUtil.sha256(normalizedPassword);
      if (entity.passwordHash !== legacyEncoded) {
        throw new UnauthorizedException('Invalid username or password');
      }
      entity.passwordHash = encoded;
    }

    entity.lastLoginAt = new Date();
    entity.lastActiveAt = new Date();
    await this.userRepository.save(entity);

    const issued = await this.issueRefreshToken(entity.id, {
      requestId: input.requestId,
    });
    const accessToken = await this.jwtTokenService.sign({
      userId: entity.id,
      type: entity.type,
      tenantId: entity.tenantId,
    });

    return buildReply(
      {
        accessToken,
        refreshToken: issued.refreshToken,
        refreshTokenExpiresAt: issued.refreshTokenExpiresAt,
        userId: entity.id,
        type: entity.type,
        tenantId: entity.tenantId,
      },
      input.requestId,
    );
  }

  private async refresh(input: {
    bodyJson?: string;
    requestId: string;
  }) {
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const refreshToken = pickString(body.refreshToken);
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = sha256(refreshToken);
    const record = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.status !== 'ACTIVE') {
      throw new UnauthorizedException('Refresh token is not active');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      record.status = 'EXPIRED';
      record.revokedAt = new Date();
      await this.refreshTokenRepository.save(record);
      throw new UnauthorizedException('Refresh token expired');
    }

    const next = await this.issueRefreshToken(record.userId, {
      requestId: input.requestId,
    });
    record.status = 'USED';
    record.usedAt = new Date();
    await this.refreshTokenRepository.save(record);

    const entity = await this.userRepository.findOne({
      where: { id: record.userId },
    });
    if (!entity || entity.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is unavailable');
    }

    entity.lastActiveAt = new Date();
    await this.userRepository.save(entity);

    const accessToken = await this.jwtTokenService.sign({
      userId: entity.id,
      type: entity.type,
      tenantId: entity.tenantId,
    });

    return buildReply(
      {
        accessToken,
        refreshToken: next.refreshToken,
        refreshTokenExpiresAt: next.refreshTokenExpiresAt,
        userId: entity.id,
        type: entity.type,
        tenantId: entity.tenantId,
      },
      input.requestId,
    );
  }

  private async register(input: {
    bodyJson?: string;
    requestId: string;
    tenantScope?: string;
  }) {
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const registerType = pickString(body.registerType);
    const account = pickString(body.account);
    const password = pickString(body.password);
    if (!registerType || !account || !password) {
      throw new Error('registerType, account and password are required');
    }
    if (!['phone', 'email', 'username'].includes(registerType)) {
      throw new Error('registerType must be one of phone, email, username');
    }
    const normalizedPassword = normalizeMd5Password(password);
    const existed = await this.userRepository.findOne({
      where: { username: account },
    });
    if (existed) {
      throw new Error('Account already exists');
    }
    const entity = this.userRepository.create({
      username: account,
      passwordHash: '',
      type: UserType.CUSTOMER,
      status: 'ACTIVE',
      tenantId: input.tenantScope?.trim() || null,
      lastLoginAt: new Date(),
      lastActiveAt: new Date(),
    });
    const saved = await this.userRepository.save(entity);
    saved.passwordHash = encodePasswordByUserId(saved.id, normalizedPassword);
    await this.userRepository.save(saved);
    const issued = await this.issueRefreshToken(saved.id, {
      requestId: input.requestId,
    });
    const accessToken = await this.jwtTokenService.sign({
      userId: saved.id,
      type: saved.type,
      tenantId: saved.tenantId,
    });
    return buildReply(
      {
        accessToken,
        refreshToken: issued.refreshToken,
        refreshTokenExpiresAt: issued.refreshTokenExpiresAt,
        userId: saved.id,
        type: saved.type,
        tenantId: saved.tenantId,
      },
      input.requestId,
    );
  }

  private async createPrivacyRequest(
    input: {
      bodyJson?: string;
      userJson?: string;
      requestId: string;
    },
    forcedType?: 'export' | 'delete' | 'revoke-consent',
  ) {
    const user = parseJson<AuthenticatedUser | null>(input.userJson, null);
    const userId = requireUserId(user);
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const type = forcedType ?? pickPrivacyRequestType(body.type);
    if (!type) {
      throw new Error('type must be one of export, delete, revoke-consent');
    }

    const record = await this.privacyRequestRepository.save(
      this.privacyRequestRepository.create({
        id: generateId(),
        userId,
        type,
        status: 'pending',
        submittedAt: new Date(),
        completedAt: null,
      }),
    );

    await writeUserAuditLog(this.userRepository.manager, {
      requestId: input.requestId,
      actorUserId: userId,
      actorType: toAuditActorType(user?.type ?? UserType.CUSTOMER),
      action: `privacy.request.${type}`,
      resourceType: 'PrivacyRequest',
      resourceId: record.id,
      metadata: { type },
    });

    return buildReply(toPrivacyRequestDto(record), input.requestId);
  }

  private async listPrivacyRequests(input: {
    queryJson?: string;
    userJson?: string;
    requestId: string;
  }) {
    const user = parseJson<AuthenticatedUser | null>(input.userJson, null);
    const query = parseJson<Record<string, unknown>>(input.queryJson, {});
    const userId = requireUserId(user);
    const page = Math.max(1, pickNumber(query.page) ?? 1);
    const pageSize = Math.max(1, Math.min(100, pickNumber(query.pageSize) ?? 20));
    const [items, total] = await this.privacyRequestRepository.findAndCount({
      where: { userId },
      order: { submittedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return buildReply(
      createPagedResult(
        items.map((item) => toPrivacyRequestDto(item)),
        page,
        pageSize,
        total,
      ) as unknown as Record<string, unknown>,
      input.requestId,
    );
  }

  private async recordConsent(input: {
    bodyJson?: string;
    userJson?: string;
    requestId: string;
  }) {
    const user = parseJson<AuthenticatedUser | null>(input.userJson, null);
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const userId = requireUserId(user);
    const consentType = pickString(body.consentType) ?? pickString(body.consentCode);
    const version = pickString(body.version) ?? 'v1';
    const granted = pickBoolean(body.granted);
    const metadata = pickObject(body.metadata) ?? {};
    if (!consentType) {
      throw new Error('consentType is required');
    }
    if (granted === undefined) {
      throw new Error('granted must be a boolean');
    }

    const now = new Date();
    const record = await this.consentRecordRepository.save(
      this.consentRecordRepository.create({
        id: generateId(),
        userId,
        consentType,
        consentVersion: version,
        granted,
        grantedAt: now,
        revokedAt: granted ? null : now,
        metadata,
      }),
    );

    await writeUserAuditLog(this.userRepository.manager, {
      requestId: input.requestId,
      actorUserId: userId,
      actorType: toAuditActorType(user?.type ?? UserType.CUSTOMER),
      action: granted ? 'privacy.consent.granted' : 'privacy.consent.revoked',
      resourceType: 'ConsentRecord',
      resourceId: record.id,
      metadata: {
        consentType,
        version,
        granted,
      },
    });

    return buildReply(toConsentRecordDto(record), input.requestId);
  }

  private async adminListUsers(input: {
    queryJson?: string;
    tenantScope?: string;
    requestId: string;
  }) {
    const query = parseJson<Record<string, unknown>>(input.queryJson, {});
    const page = Math.max(1, pickNumber(query.page) ?? 1);
    const pageSize = Math.max(1, Math.min(100, pickNumber(query.pageSize) ?? 20));
    const type = pickNumber(query.type);
    const where: Record<string, unknown> = {};
    if (type !== undefined) {
      where.type = type;
    }
    if (input.tenantScope?.trim()) {
      where.tenantId = input.tenantScope.trim();
    }
    const [users, total] = await this.userRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return buildReply({
      items: users.map((user) => toAuthUserDto(user)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
        hasMore: page * pageSize < total,
      },
    }, input.requestId);
  }

  private async adminGetUser(input: {
    paramsJson?: string;
    tenantScope?: string;
    requestId: string;
  }) {
    const params = parseJson<Record<string, unknown>>(input.paramsJson, {});
    const id = pickString(params.id);
    if (!id) {
      throw new Error('user id is required');
    }
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (input.tenantScope?.trim() && user.tenantId !== input.tenantScope.trim()) {
      throw new NotFoundException('User not found');
    }
    return buildReply(toAuthUserDto(user), input.requestId);
  }

  private async adminUpdateUser(input: {
    paramsJson?: string;
    bodyJson?: string;
    tenantScope?: string;
    requestId: string;
  }) {
    const params = parseJson<Record<string, unknown>>(input.paramsJson, {});
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const id = pickString(params.id);
    if (!id) {
      throw new Error('user id is required');
    }
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (input.tenantScope?.trim() && user.tenantId !== input.tenantScope.trim()) {
      throw new NotFoundException('User not found');
    }
    const nextUsername = pickString(body.username);
    if (nextUsername && nextUsername !== user.username) {
      const duplicated = await this.userRepository.findOne({ where: { username: nextUsername } });
      if (duplicated && duplicated.id !== user.id) {
        throw new Error('Username already exists');
      }
      user.username = nextUsername;
    }
    const nextPassword = pickString(body.password);
    if (nextPassword) {
      user.passwordHash = encodePasswordByUserId(user.id, nextPassword);
    }
    const nextStatus = pickString(body.status);
    if (nextStatus) {
      user.status = nextStatus as 'ACTIVE' | 'DISABLED';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'tenantId')) {
      user.tenantId = pickString(body.tenantId) ?? null;
    }
    await this.userRepository.save(user);
    return buildReply(toAuthUserDto(user), input.requestId);
  }

  private async adminCreateUser(input: {
    bodyJson?: string;
    tenantScope?: string;
    userJson?: string;
    requestId: string;
  }) {
    const body = parseJson<Record<string, unknown>>(input.bodyJson, {});
    const username = pickString(body.username);
    const password = pickString(body.password);
    const type = pickNumber(body.type);
    if (!username || !password || type === undefined) {
      throw new Error('username, password and type are required');
    }
    if (!isValidUserType(type)) {
      throw new Error('type must be one of 0(CUSTOMER), 1(INTERNAL), 2(PARTNER)');
    }
    const existed = await this.userRepository.findOne({ where: { username } });
    if (existed) {
      throw new Error('Username already exists');
    }
    const actor = parseJson<AuthenticatedUser | null>(input.userJson, null);
    const tenantId = resolveTargetTenantId(
      pickString(body.tenantId) ?? null,
      input.tenantScope?.trim() || null,
    );
    const entity = this.userRepository.create({
      username,
      passwordHash: '',
      type,
      status: pickString(body.status) === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
      tenantId,
    });
    const saved = await this.userRepository.save(entity);
    saved.passwordHash = encodePasswordByUserId(saved.id, password);
    await this.userRepository.save(saved);
    await writeUserAuditLog(this.userRepository.manager, {
      requestId: input.requestId,
      actorUserId: actor?.userId ?? null,
      actorType: actor ? toAuditActorType(actor.type) : 'SYSTEM',
      action: 'auth.user.created',
      resourceType: 'User',
      resourceId: saved.id,
      metadata: {
        username: saved.username,
        type: saved.type,
        tenantId: saved.tenantId,
      },
    });
    return buildReply(toAuthUserDto(saved), input.requestId);
  }

  private async adminDeleteUser(input: {
    paramsJson?: string;
    tenantScope?: string;
    userJson?: string;
    requestId: string;
  }) {
    const params = parseJson<Record<string, unknown>>(input.paramsJson, {});
    const id = pickString(params.id);
    if (!id) {
      throw new Error('user id is required');
    }
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (input.tenantScope?.trim() && user.tenantId !== input.tenantScope.trim()) {
      throw new NotFoundException('User not found');
    }
    await this.refreshTokenRepository
      .createQueryBuilder()
      .update(RefreshTokenEntity)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
      })
      .where('user_id = :userId', { userId: user.id })
      .andWhere('status = :status', { status: 'ACTIVE' })
      .execute();
    await this.userRepository.softDelete(user.id);
    const actor = parseJson<AuthenticatedUser | null>(input.userJson, null);
    await writeUserAuditLog(this.userRepository.manager, {
      requestId: input.requestId,
      actorUserId: actor?.userId ?? null,
      actorType: actor ? toAuditActorType(actor.type) : 'SYSTEM',
      action: 'auth.user.deleted',
      resourceType: 'User',
      resourceId: user.id,
      metadata: {
        username: user.username,
        tenantId: user.tenantId,
      },
    });
    return buildReply({ deleted: true }, input.requestId);
  }

  private async issueRefreshToken(
    userId: string,
    _context: { requestId: string },
  ): Promise<{ refreshToken: string; refreshTokenExpiresAt: Date }> {
    const refreshToken = `rt_${require('ulid').ulid().toLowerCase()}_${randomId(24)}`;
    const refreshTokenExpiresAt = new Date(Date.now() + resolveRefreshTokenTtlMs());
    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        userId,
        tokenHash: sha256(refreshToken),
        status: 'ACTIVE',
        expiresAt: refreshTokenExpiresAt,
        usedAt: null,
        revokedAt: null,
        replacedById: null,
        issuedIp: null,
        issuedUserAgent: null,
        metadata: {},
      }),
    );
    return {
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private async loginByThirdParty(input: {
    provider: 'wechat' | 'apple';
    providerUserId?: string;
    unionId?: string | null;
    openId?: string | null;
    email?: string | null;
    metadata?: Record<string, unknown>;
    requestId: string;
  }) {
    const providerUserId = pickString(input.providerUserId);
    if (!providerUserId) {
      throw new Error('providerUserId is required');
    }

    const foundIdentity = await this.thirdPartyIdentityRepository.findOne({
      where: {
        provider: input.provider,
        providerUserId,
      },
    });

    let user: UserEntity;
    if (foundIdentity) {
      const existed = await this.userRepository.findOne({
        where: { id: foundIdentity.userId },
      });
      if (!existed) {
        throw new UnauthorizedException('Invalid third-party identity binding');
      }
      user = existed;
    } else {
      const entity = this.userRepository.create({
        username: await this.buildThirdPartyUsername(input.provider, providerUserId),
        passwordHash: '',
        type: UserType.CUSTOMER,
        status: 'ACTIVE',
        tenantId: getDefaultTenantId(),
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
      });
      const savedUser = await this.userRepository.save(entity);
      savedUser.passwordHash = encodePasswordByUserId(
        savedUser.id,
        HashUtil.md5(generateId()),
      );
      user = await this.userRepository.save(savedUser);

      await this.thirdPartyIdentityRepository.save(
        this.thirdPartyIdentityRepository.create({
          userId: user.id,
          provider: input.provider,
          providerUserId,
          unionId: input.unionId ?? null,
          openId: input.openId ?? null,
          email: input.email ?? null,
          metadata: input.metadata ?? {},
        }),
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is disabled');
    }

    user.lastLoginAt = new Date();
    user.lastActiveAt = new Date();
    await this.userRepository.save(user);

    const issued = await this.issueRefreshToken(user.id, {
      requestId: input.requestId,
    });
    const accessToken = await this.jwtTokenService.sign({
      userId: user.id,
      type: user.type,
      tenantId: user.tenantId,
    });

    await writeUserAuditLog(this.userRepository.manager, {
      requestId: input.requestId,
      actorUserId: user.id,
      actorType: '0',
      action: `auth.${input.provider}.login`,
      resourceType: 'ThirdPartyIdentity',
      resourceId: providerUserId,
      metadata: {
        provider: input.provider,
        providerUserId,
      },
    });

    return buildReply(
      {
        accessToken,
        refreshToken: issued.refreshToken,
        refreshTokenExpiresAt: issued.refreshTokenExpiresAt,
        userId: user.id,
        type: user.type,
        tenantId: user.tenantId,
      },
      input.requestId,
    );
  }

  private async buildThirdPartyUsername(
    provider: 'wechat' | 'apple',
    providerUserId: string,
  ): Promise<string> {
    const safePart = providerUserId.trim().replace(/\s+/g, '_').slice(0, 96);
    const preferred = `${provider}_${safePart}`;
    const existed = await this.userRepository.findOne({
      where: { username: preferred },
    });
    if (!existed) {
      return preferred;
    }
    return `${provider}_${generateId().slice(-10)}`;
  }
}

function buildReply(data: Record<string, unknown>, requestId: string) {
  return buildGatewayGrpcSuccess(data, requestId);
}

function toAuthUserDto(user: UserEntity): Record<string, unknown> {
  return {
    id: user.id,
    username: user.username,
    type: user.type,
    status: user.status,
    tenantId: user.tenantId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt ?? null,
    lastActiveAt: user.lastActiveAt ?? null,
  };
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function requireUserId(user: AuthenticatedUser | null): string {
  const userId = user?.userId?.trim();
  if (!userId) {
    throw new Error('Missing user context');
  }
  return userId;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pickBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

function pickObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function sha256(value: string): string {
  return require('node:crypto').createHash('sha256').update(value).digest('hex');
}

function normalizeMd5Password(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/i.test(normalized)) {
    throw new Error('password must be a 32-character md5 hex string');
  }
  return normalized;
}

function encodePasswordByUserId(userId: string, md5Password: string): string {
  return HashUtil.sha256(`${userId}:${normalizeMd5Password(md5Password)}`);
}

function randomId(length: number): string {
  return require('node:crypto').randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function resolveRefreshTokenTtlMs(): number {
  const configured = String(getEnvString('REFRESH_TOKEN_EXPIRE_IN') ?? '').trim();
  if (!configured) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const numeric = Number(configured);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric * 1000);
  }
  const matched = configured.match(/^(\d+)\s*([smhd])$/i);
  if (!matched) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const value = Number(matched[1]);
  const unit = matched[2].toLowerCase();
  const multiplier =
    unit === 's'
      ? 1000
      : unit === 'm'
        ? 60 * 1000
        : unit === 'h'
          ? 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
  return value * multiplier;
}

function isValidUserType(value: unknown): value is UserType {
  return value === UserType.CUSTOMER || value === UserType.INTERNAL || value === UserType.PARTNER;
}

function pickPrivacyRequestType(
  value: unknown,
): 'export' | 'delete' | 'revoke-consent' | undefined {
  return value === 'export' || value === 'delete' || value === 'revoke-consent'
    ? value
    : undefined;
}

function pickVerifyType(value: unknown): 'phone' | 'email' | undefined {
  return value === 'phone' || value === 'email' ? value : undefined;
}

function toPrivacyRequestDto(record: PrivacyRequestEntity): Record<string, unknown> {
  return {
    id: record.id,
    userId: record.userId,
    type: record.type,
    status: record.status,
    submittedAt: record.submittedAt,
    completedAt: record.completedAt,
  };
}

function toConsentRecordDto(record: ConsentRecordEntity): Record<string, unknown> {
  return {
    id: record.id,
    userId: record.userId,
    consentType: record.consentType,
    version: record.consentVersion,
    granted: record.granted,
    grantedAt: record.grantedAt,
    revokedAt: record.revokedAt,
    metadata: record.metadata ?? {},
  };
}

function resolveTargetTenantId(
  targetTenantId: string | null,
  tenantScope?: string | null,
): string | null {
  if (!tenantScope) {
    return targetTenantId;
  }
  if (targetTenantId && targetTenantId !== tenantScope) {
    throw new Error('tenantId mismatch');
  }
  return tenantScope;
}

function toAuditActorType(type: number): '0' | '1' | '2' {
  if (type === UserType.INTERNAL) {
    return '1';
  }
  if (type === UserType.PARTNER) {
    return '2';
  }
  return '0';
}

async function writeUserAuditLog(
  manager: EntityManager,
  input: {
    requestId: string;
    actorUserId: string | null;
    actorType: '0' | '1' | '2' | 'SYSTEM';
    action: string;
    resourceType: string;
    resourceId: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { UserAuditLogEntity } = await import('./user.entities');
  await manager.save(
    manager.create(UserAuditLogEntity, {
      actorUserId: input.actorUserId,
      actorType: input.actorType,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata ?? {},
    }),
  );
}
