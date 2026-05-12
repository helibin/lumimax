import { BaseEntity } from '@lumimax/database';
import { Column, CreateDateColumn, Entity, Index } from 'typeorm';

@Entity('system_admins')
export class SystemAdminEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 64, unique: true })
  @Index()
  username!: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 64 })
  nickname!: string;

  @Column({ type: 'varchar', length: 128, nullable: true, unique: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, unique: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: string;

  @Column({ type: 'timestamp', precision: 3, name: 'last_login_at', nullable: true })
  lastLoginAt?: Date | null;
}

@Entity('system_roles')
export class SystemRoleEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 64, unique: true })
  @Index()
  code!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: string;
}

@Entity('system_admin_roles')
@Index('uq_system_admin_roles_admin_id_role_id', ['adminId', 'roleId'], { unique: true })
@Index('idx_system_admin_roles_admin_id', ['adminId'])
@Index('idx_system_admin_roles_role_id', ['roleId'])
export class SystemAdminRoleEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'admin_id' })
  adminId!: string;

  @Column({ type: 'varchar', length: 36, name: 'role_id' })
  roleId!: string;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamp', precision: 3 })
  assignedAt!: Date;
}

@Entity('system_role_permissions')
@Index('uq_system_role_permissions_role_id_permission_id', ['roleId', 'permissionId'], { unique: true })
@Index('idx_system_role_permissions_role_id', ['roleId'])
@Index('idx_system_role_permissions_permission_id', ['permissionId'])
export class SystemRolePermissionEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'role_id' })
  roleId!: string;

  @Column({ type: 'varchar', length: 36, name: 'permission_id' })
  permissionId!: string;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamp', precision: 3 })
  assignedAt!: Date;
}

@Entity('system_menus')
export class SystemMenuEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 64, unique: true })
  @Index()
  code!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 36, name: 'parent_id', nullable: true })
  @Index()
  parentId?: string | null;

  @Column({ type: 'varchar', length: 16, name: 'menu_type', default: 'menu' })
  menuType!: string;

  @Column({ type: 'varchar', length: 255, name: 'route_path', nullable: true })
  routePath?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  component?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  icon?: string | null;

  @Column({ type: 'varchar', length: 64, name: 'permission_code', nullable: true })
  permissionCode?: string | null;

  @Column({ type: 'integer', default: 0 })
  sort!: number;

  @Column({ type: 'boolean', default: true })
  visible!: boolean;

  @Column({ type: 'boolean', name: 'keep_alive', default: false })
  keepAlive!: boolean;

  @Column({ type: 'varchar', length: 255, name: 'external_link', nullable: true })
  externalLink?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: string;

  @Column({ type: 'jsonb', name: 'extra_json', nullable: true })
  extraJson?: Record<string, unknown> | null;
}

@Entity('system_role_menus')
@Index('uq_system_role_menus_role_id_menu_id', ['roleId', 'menuId'], { unique: true })
@Index('idx_system_role_menus_role_id', ['roleId'])
@Index('idx_system_role_menus_menu_id', ['menuId'])
export class SystemRoleMenuEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'role_id' })
  roleId!: string;

  @Column({ type: 'varchar', length: 36, name: 'menu_id' })
  menuId!: string;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamp', precision: 3 })
  assignedAt!: Date;
}

@Entity('system_permissions')
export class SystemPermissionEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 64, unique: true })
  @Index()
  code!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 64, name: 'group_code' })
  groupCode!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;
}

@Entity('system_dictionaries')
export class SystemDictionaryEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 64, unique: true })
  @Index()
  code!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: string;
}

@Entity('system_dictionary_items')
export class SystemDictionaryItemEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 64, name: 'dictionary_code' })
  @Index()
  dictionaryCode!: string;

  @Column({ type: 'varchar', length: 64 })
  label!: string;

  @Column({ type: 'varchar', length: 64 })
  value!: string;

  @Column({ type: 'integer', default: 0 })
  sort!: number;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: string;

  @Column({ type: 'jsonb', name: 'extra_json', nullable: true })
  extraJson?: Record<string, unknown> | null;
}

@Entity('system_configs')
export class SystemConfigEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 128, name: 'config_key', unique: true })
  @Index()
  configKey!: string;

  @Column({ type: 'text', name: 'config_value' })
  configValue!: string;

  @Column({ type: 'varchar', length: 32, name: 'value_type' })
  valueType!: string;

  @Column({ type: 'varchar', length: 64, name: 'group_code' })
  groupCode!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'boolean', name: 'is_encrypted', default: false })
  isEncrypted!: boolean;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: string;
}

@Entity('system_audit_logs')
export class SystemAuditLogEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'operator_id' })
  operatorId!: string;

  @Column({ type: 'varchar', length: 64, name: 'operator_name' })
  operatorName!: string;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'varchar', length: 64, name: 'resource_type' })
  resourceType!: string;

  @Column({ type: 'varchar', length: 36, name: 'resource_id', nullable: true })
  resourceId?: string | null;

  @Column({ type: 'jsonb', name: 'before_json', nullable: true })
  beforeJson?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'after_json', nullable: true })
  afterJson?: Record<string, unknown> | null;
}

@Entity('storage_objects')
export class StorageObjectEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id', nullable: true })
  @Index()
  tenantId?: string | null;

  @Column({ type: 'text', name: 'object_key', unique: true })
  @Index()
  objectKey!: string;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'varchar', length: 128 })
  bucket!: string;

  @Column({ type: 'varchar', length: 64 })
  region!: string;

  @Column({ type: 'varchar', length: 32, name: 'owner_type' })
  ownerType!: string;

  @Column({ type: 'varchar', length: 36, name: 'owner_id' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: string;

  @Column({ type: 'varchar', length: 36, name: 'user_id', nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'device_id', nullable: true })
  deviceId?: string | null;

  @Column({ type: 'varchar', length: 64, name: 'biz_type', nullable: true })
  bizType?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'biz_id', nullable: true })
  bizId?: string | null;

  @Column({ type: 'varchar', length: 32, name: 'media_type', nullable: true })
  mediaType?: string | null;

}
