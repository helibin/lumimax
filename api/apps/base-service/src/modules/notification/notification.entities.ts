import { BaseEntity as DatabaseBaseEntity } from '@lumimax/database';
import { Column, Entity, Index } from 'typeorm';

export type NotificationChannel = 'push' | 'email' | 'sms' | 'webhook';
export type NotificationMessageStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'partial_failed'
  | 'failed';
export type DevicePlatform = 'ios' | 'android' | 'web';
export type DevicePushProvider = 'apns' | 'fcm' | 'jpush';

@Entity('notification_messages')
export class NotificationMessageEntity extends DatabaseBaseEntity {

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  @Index('idx_notification_messages_user_id')
  userId!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  @Index('idx_notification_messages_tenant_id')
  tenantId!: string | null;

  @Column({ name: 'event_name', type: 'varchar', length: 128 })
  eventName!: string;

  @Column({ name: 'template_code', type: 'varchar', length: 128 })
  templateCode!: string;

  @Column({ name: 'title', type: 'varchar', length: 255, default: '' })
  title!: string;

  @Column({ name: 'content', type: 'text', default: '' })
  content!: string;

  @Column({ name: 'payload', type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'pending' })
  status!: NotificationMessageStatus;

  @Column({ name: 'scheduled_at', type: 'timestamp', precision: 3, nullable: true })
  scheduledAt!: Date | null;
}

@Entity('notification_templates')
export class NotificationTemplateEntity extends DatabaseBaseEntity {

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  @Index('idx_notification_templates_tenant_id')
  tenantId!: string | null;

  @Column({ name: 'code', type: 'varchar', length: 128 })
  @Index('idx_notification_templates_code')
  code!: string;

  @Column({ name: 'channel', type: 'varchar', length: 16 })
  channel!: NotificationChannel;

  @Column({ name: 'locale', type: 'varchar', length: 16, default: 'zh-CN' })
  locale!: string;

  @Column({ name: 'title_template', type: 'text' })
  titleTemplate!: string;

  @Column({ name: 'content_template', type: 'text' })
  contentTemplate!: string;

  @Column({ name: 'variables_schema', type: 'jsonb', default: () => "'{}'::jsonb" })
  variablesSchema!: Record<string, unknown>;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;
}

@Entity('device_tokens')
export class DeviceTokenEntity extends DatabaseBaseEntity {

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  @Index('idx_device_tokens_tenant_id')
  tenantId!: string | null;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  @Index('idx_device_tokens_user_id')
  userId!: string;

  @Column({ name: 'platform', type: 'varchar', length: 16 })
  platform!: DevicePlatform;

  @Column({ name: 'provider', type: 'varchar', length: 16 })
  provider!: DevicePushProvider;

  @Column({ name: 'token', type: 'varchar', length: 512, unique: true })
  @Index('idx_device_tokens_token', { unique: true })
  token!: string;

  @Column({ name: 'app_id', type: 'varchar', length: 128, nullable: true })
  appId!: string | null;

  @Column({ name: 'region', type: 'varchar', length: 32, nullable: true })
  region!: string | null;

  @Column({ name: 'locale', type: 'varchar', length: 16, nullable: true })
  locale!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamp', precision: 3, nullable: true })
  lastSeenAt!: Date | null;
}
