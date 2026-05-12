import { BaseEntity } from '@lumimax/database';
import { Column, Entity, Index } from 'typeorm';

export enum UserType {
  CUSTOMER = 0,
  INTERNAL = 1,
  PARTNER = 2,
}

export type UserStatusValue = 'ACTIVE' | 'DISABLED';
export type ThirdPartyProvider = 'google' | 'wechat' | 'apple';
export type PrivacyRequestType = 'export' | 'delete' | 'revoke-consent';
export type PrivacyRequestStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'rejected';
export type RefreshTokenStatusValue = 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';
export type OtpVerifyType = 'phone' | 'email';
export type UserAuditActorType = '0' | '1' | '2' | 'SYSTEM';

@Entity('users')
export class UserEntity extends BaseEntity {

  @Column({ name: 'username', type: 'varchar', length: 128, unique: true })
  @Index()
  username!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ name: 'type', type: 'smallint' })
  type!: UserType;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: UserStatusValue;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'last_login_at', type: 'timestamp', precision: 3, nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'last_active_at', type: 'timestamp', precision: 3, nullable: true })
  lastActiveAt!: Date | null;
}

@Entity('third_party_identities')
export class ThirdPartyIdentityEntity extends BaseEntity {

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  tenantId!: string | null;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  @Index()
  userId!: string;

  @Column({ name: 'provider', type: 'varchar', length: 16 })
  provider!: ThirdPartyProvider;

  @Column({ name: 'provider_user_id', type: 'varchar', length: 191 })
  @Index()
  providerUserId!: string;

  @Column({ name: 'union_id', type: 'varchar', length: 191, nullable: true })
  unionId!: string | null;

  @Column({ name: 'open_id', type: 'varchar', length: 191, nullable: true })
  openId!: string | null;

  @Column({ name: 'email', type: 'varchar', length: 191, nullable: true })
  email!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;
}

@Entity('privacy_requests')
export class PrivacyRequestEntity extends BaseEntity {

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  tenantId!: string | null;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  @Index()
  userId!: string;

  @Column({ name: 'type', type: 'varchar', length: 32 })
  type!: PrivacyRequestType;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'pending' })
  status!: PrivacyRequestStatus;

  @Column({ name: 'submitted_at', type: 'timestamp', precision: 3 })
  submittedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamp', precision: 3, nullable: true })
  completedAt!: Date | null;
}

@Entity('consent_records')
export class ConsentRecordEntity extends BaseEntity {

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  tenantId!: string | null;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  @Index()
  userId!: string;

  @Column({ name: 'consent_type', type: 'varchar', length: 64 })
  consentType!: string;

  @Column({ name: 'consent_version', type: 'varchar', length: 32 })
  consentVersion!: string;

  @Column({ name: 'granted', type: 'boolean' })
  granted!: boolean;

  @Column({ name: 'granted_at', type: 'timestamp', precision: 3 })
  grantedAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', precision: 3, nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;
}

@Entity('audit_logs')
export class UserAuditLogEntity extends BaseEntity {

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  tenantId!: string | null;

  @Column({ name: 'actor_user_id', type: 'varchar', length: 36, nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 16 })
  actorType!: UserAuditActorType;

  @Column({ name: 'action', type: 'varchar', length: 128 })
  action!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 64 })
  resourceType!: string;

  @Column({ name: 'resource_id', type: 'varchar', length: 64, nullable: true })
  resourceId!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;
}

@Entity('refresh_tokens')
export class RefreshTokenEntity extends BaseEntity {

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  tenantId!: string | null;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  @Index()
  userId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 128, unique: true })
  @Index()
  tokenHash!: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ACTIVE' })
  status!: RefreshTokenStatusValue;

  @Column({ name: 'expires_at', type: 'timestamp', precision: 3 })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamp', precision: 3, nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamp', precision: 3, nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'replaced_by_id', type: 'varchar', length: 36, nullable: true })
  replacedById!: string | null;

  @Column({ name: 'issued_ip', type: 'varchar', length: 64, nullable: true })
  issuedIp!: string | null;

  @Column({ name: 'issued_user_agent', type: 'varchar', length: 255, nullable: true })
  issuedUserAgent!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;
}

@Entity('otp_codes')
export class OtpCodeEntity extends BaseEntity {

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  @Index('idx_otp_codes_tenant_id')
  tenantId!: string | null;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  @Index('idx_otp_codes_user_id')
  userId!: string;

  @Column({ name: 'verify_type', type: 'varchar', length: 16 })
  @Index('idx_otp_codes_verify_type')
  verifyType!: OtpVerifyType;

  @Column({ name: 'target', type: 'varchar', length: 255 })
  @Index('idx_otp_codes_target')
  target!: string;

  @Column({ name: 'scene', type: 'varchar', length: 64, default: '' })
  @Index('idx_otp_codes_scene')
  scene!: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 128 })
  codeHash!: string;

  @Column({ name: 'expires_at', type: 'timestamp', precision: 3 })
  @Index('idx_otp_codes_expires_at')
  expiresAt!: Date;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 5 })
  maxAttempts!: number;

  @Column({ name: 'consumed_at', type: 'timestamp', precision: 3, nullable: true })
  consumedAt!: Date | null;
}
