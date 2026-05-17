import { BaseEntity } from '@lumimax/database';
import { Column, Entity, Index } from 'typeorm';

@Entity('devices')
export class DeviceEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 128, name: 'name', default: '' })
  name!: string;

  @Column({ type: 'varchar', length: 64, name: 'device_sn', unique: true })
  @Index()
  deviceSn!: string;

  @Column({ type: 'varchar', length: 64, name: 'product_key' })
  productKey!: string;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'varchar', length: 32, default: 'inactive' })
  status!: string;

  @Column({ type: 'varchar', length: 32, name: 'online_status', default: 'offline' })
  onlineStatus!: string;

  @Column({ type: 'varchar', length: 36, name: 'bound_user_id', nullable: true })
  boundUserId?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  locale?: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  market?: string | null;

  @Column({ type: 'varchar', length: 16, name: 'country_code', nullable: true })
  countryCode?: string | null;

  @Column({ type: 'timestamp', precision: 3, name: 'last_seen_at', nullable: true })
  lastSeenAt?: Date | null;
}

@Entity('device_bindings')
export class DeviceBindingEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'device_id' })
  @Index()
  deviceId!: string;

  @Column({ type: 'varchar', length: 36, name: 'user_id' })
  @Index()
  userId!: string;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: string;

  @Column({ type: 'timestamp', precision: 3, name: 'bound_at', nullable: true })
  boundAt?: Date | null;

  @Column({ type: 'timestamp', precision: 3, name: 'unbound_at', nullable: true })
  unboundAt?: Date | null;
}

@Entity('device_status_logs')
export class DeviceStatusLogEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'device_id' })
  @Index()
  deviceId!: string;

  @Column({ type: 'varchar', length: 32, name: 'online_status' })
  onlineStatus!: string;

  @Column({ type: 'varchar', length: 32, name: 'device_status' })
  deviceStatus!: string;

  @Column({ type: 'jsonb', name: 'payload_json', nullable: true })
  payloadJson?: Record<string, unknown> | null;

  @Column({ type: 'timestamp', precision: 3, name: 'reported_at', nullable: true })
  reportedAt?: Date | null;
}

@Entity('device_commands')
export class DeviceCommandEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'device_id' })
  @Index()
  deviceId!: string;

  @Column({ type: 'varchar', length: 128, name: 'command_type' })
  commandType!: string;

  @Column({ type: 'jsonb', name: 'payload_json', nullable: true })
  payloadJson?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: string;

  @Column({ type: 'varchar', length: 36, name: 'requested_by', nullable: true })
  requestedBy?: string | null;

  @Column({ type: 'timestamp', precision: 3, name: 'requested_at', nullable: true })
  requestedAt?: Date | null;

  @Column({ type: 'timestamp', precision: 3, name: 'sent_at', nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'timestamp', precision: 3, name: 'acked_at', nullable: true })
  ackedAt?: Date | null;

  @Column({ type: 'text', name: 'failure_reason', nullable: true })
  failureReason?: string | null;
}

@Entity('device_shadows')
export class DeviceShadowEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'device_id', unique: true })
  @Index()
  deviceId!: string;

  @Column({ type: 'jsonb', default: {} })
  reported!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  desired!: Record<string, unknown>;

  @Column({ type: 'integer', name: 'shadow_version', default: 1 })
  shadowVersion!: number;

  @Column({ type: 'varchar', length: 32, name: 'source_provider' })
  sourceProvider!: string;
}

@Entity('device_runtime_statuses')
export class DeviceRuntimeStatusEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'device_id', unique: true })
  @Index()
  deviceId!: string;

  @Column({ type: 'integer', name: 'battery_level', nullable: true })
  batteryLevel?: number | null;

  @Column({ type: 'varchar', length: 64, name: 'firmware_version', nullable: true })
  firmwareVersion?: string | null;

  @Column({ type: 'varchar', length: 64, name: 'hardware_version', nullable: true })
  hardwareVersion?: string | null;

  @Column({ type: 'varchar', length: 64, name: 'protocol_version', nullable: true })
  protocolVersion?: string | null;

  @Column({ type: 'integer', nullable: true })
  rssi?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  temperature?: string | null;

  @Column({ type: 'varchar', length: 32, name: 'network_status', nullable: true })
  networkStatus?: string | null;

  @Column({ type: 'jsonb', name: 'payload_json', nullable: true })
  payloadJson?: Record<string, unknown> | null;

  @Column({ type: 'timestamp', precision: 3, name: 'reported_at', nullable: true })
  reportedAt?: Date | null;
}

@Entity('iot_messages')
export class IotMessageEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 64, unique: true, name: 'message_key' })
  @Index()
  messageKey!: string;

  @Column({ type: 'varchar', length: 128, name: 'device_id', nullable: true })
  deviceId?: string | null;

  @Column({ type: 'varchar', length: 32 })
  direction!: string;

  @Column({ type: 'varchar', length: 255 })
  topic!: string;

  @Column({ type: 'varchar', length: 64 })
  event!: string;

  @Column({ type: 'varchar', length: 32, default: 'received' })
  status!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  provider?: string | null;

  @Column({ type: 'int', name: 'retry_count', default: 0 })
  retryCount!: number;

  @Column({ type: 'jsonb', name: 'payload_json', nullable: true })
  payloadJson?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'result_json', nullable: true })
  resultJson?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'error_json', nullable: true })
  errorJson?: Record<string, unknown> | null;
}

@Entity('iot_provision_records')
export class IotProvisionRecordEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'device_id' })
  @Index()
  deviceId!: string;

  @Column({ type: 'varchar', length: 32 })
  vendor!: string;

  @Column({ type: 'varchar', length: 32, default: 'created' })
  status!: string;

  @Column({ type: 'jsonb', name: 'request_payload_json', nullable: true })
  requestPayloadJson?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'response_payload_json', nullable: true })
  responsePayloadJson?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'error_json', nullable: true })
  errorJson?: Record<string, unknown> | null;
}

@Entity('device_credentials')
export class DeviceCredentialEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'device_id' })
  @Index()
  deviceId!: string;

  @Column({ type: 'varchar', length: 32 })
  vendor!: string;

  @Column({ type: 'varchar', length: 32, name: 'credential_type', default: 'certificate' })
  credentialType!: string;

  @Column({ type: 'varchar', length: 128, name: 'credential_id', nullable: true })
  credentialId?: string | null;

  @Column({ type: 'varchar', length: 255, name: 'thing_name', nullable: true })
  thingName?: string | null;

  @Column({ type: 'varchar', length: 255, name: 'certificate_arn', nullable: true })
  certificateArn?: string | null;

  @Column({ type: 'text', name: 'certificate_pem', nullable: true })
  certificatePem?: string | null;

  @Column({ type: 'text', name: 'private_key_pem', nullable: true })
  privateKeyPem?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  endpoint?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  region?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  fingerprint?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: string;

  @Column({ type: 'timestamp', precision: 3, name: 'issued_at', nullable: true })
  issuedAt?: Date | null;

  @Column({ type: 'timestamp', precision: 3, name: 'expires_at', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'jsonb', name: 'metadata_json', nullable: true })
  metadataJson?: Record<string, unknown> | null;
}

@Entity('meal_records')
export class MealRecordEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'user_id', nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'device_id', nullable: true })
  deviceId?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  locale?: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  market?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'created' })
  status!: string;

  @Column({ type: 'timestamp', precision: 3, name: 'started_at', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'timestamp', precision: 3, name: 'finished_at', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'total_calories', default: 0 })
  totalCalories!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'total_weight', default: 0 })
  totalWeight!: string;
}

@Entity('meal_items')
export class MealItemEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'meal_record_id' })
  @Index()
  mealRecordId!: string;

  @Column({ type: 'varchar', length: 128, name: 'food_name' })
  foodName!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  weight!: string;

  @Column({ type: 'text', name: 'image_key', nullable: true })
  imageKey?: string | null;

  @Column({ type: 'text', name: 'image_object_id', nullable: true })
  imageObjectId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'user_id', nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'device_id', nullable: true })
  deviceId?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  locale?: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  market?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'calories', default: 0 })
  calories!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'protein', default: 0 })
  protein!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'fat', default: 0 })
  fat!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'carbs', default: 0 })
  carbs!: string;

  @Column({ type: 'varchar', length: 64, name: 'source', nullable: true })
  source?: string | null;

  @Column({ type: 'varchar', length: 32, name: 'recognition_status', default: 'success' })
  recognitionStatus!: string;
}

@Entity('foods')
export class FoodEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 128 })
  @Index()
  name!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  brand?: string | null;

  @Column({ type: 'varchar', length: 16, name: 'country_code', nullable: true })
  countryCode?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  source?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: string;
}

@Entity('food_nutritions')
export class FoodNutritionEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'food_id' })
  @Index()
  foodId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'calories_per_100g', default: 0 })
  caloriesPer100g!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'protein_per_100g', default: 0 })
  proteinPer100g!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'fat_per_100g', default: 0 })
  fatPer100g!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'carbs_per_100g', default: 0 })
  carbsPer100g!: string;

  @Column({ type: 'jsonb', name: 'extra_json', nullable: true })
  extraJson?: Record<string, unknown> | null;
}

@Entity('food_aliases')
export class FoodAliasEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'food_id' })
  @Index()
  foodId!: string;

  @Column({ type: 'varchar', length: 128 })
  @Index()
  alias!: string;

  @Column({ type: 'varchar', length: 128, name: 'normalized_alias' })
  @Index()
  normalizedAlias!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  locale?: string | null;

  @Column({ type: 'varchar', length: 16, name: 'country_code', nullable: true })
  countryCode?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  source?: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0.8 })
  confidence!: string;
}

@Entity('food_locale_names')
export class FoodLocaleNameEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'food_id' })
  @Index()
  foodId!: string;

  @Column({ type: 'varchar', length: 16 })
  locale!: string;

  @Column({ type: 'varchar', length: 16, name: 'country_code', nullable: true })
  countryCode?: string | null;

  @Column({ type: 'varchar', length: 128, name: 'display_name' })
  displayName!: string;

  @Column({ type: 'varchar', length: 128, name: 'normalized_name' })
  @Index()
  normalizedName!: string;
}

@Entity('external_food_mappings')
export class ExternalFoodMappingEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'food_id' })
  @Index()
  foodId!: string;

  @Column({ type: 'varchar', length: 64, name: 'provider_code' })
  @Index()
  providerCode!: string;

  @Column({ type: 'varchar', length: 128, name: 'external_food_id' })
  @Index()
  externalFoodId!: string;

  @Column({ type: 'varchar', length: 255, name: 'external_name', nullable: true })
  externalName?: string | null;

  @Column({ type: 'varchar', length: 16, name: 'country_code', nullable: true })
  countryCode?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  locale?: string | null;

  @Column({ type: 'jsonb', name: 'raw_payload', nullable: true })
  rawPayload?: Record<string, unknown> | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0.8 })
  confidence!: string;
}

@Entity('food_corrections')
export class FoodCorrectionEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 36, name: 'user_id', nullable: true })
  @Index()
  userId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'meal_id', nullable: true })
  @Index()
  mealId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'meal_item_id', nullable: true })
  @Index()
  mealItemId?: string | null;

  @Column({ type: 'varchar', length: 128, name: 'original_food_name', nullable: true })
  originalFoodName?: string | null;

  @Column({ type: 'varchar', length: 128, name: 'corrected_food_name', nullable: true })
  correctedFoodName?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'original_weight_gram', nullable: true })
  originalWeightGram?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'corrected_weight_gram', nullable: true })
  correctedWeightGram?: string | null;

  @Column({ type: 'varchar', length: 64, name: 'original_provider_code', nullable: true })
  originalProviderCode?: string | null;

  @Column({ type: 'varchar', length: 64, name: 'corrected_provider_code', nullable: true })
  correctedProviderCode?: string | null;

  @Column({ type: 'varchar', length: 64, name: 'correction_type', default: 'manual_confirm' })
  correctionType!: string;

  @Column({ type: 'jsonb', name: 'extra_json', nullable: true })
  extraJson?: Record<string, unknown> | null;
}

@Entity('recognition_logs')
export class RecognitionLogEntity extends BaseEntity {

  @Column({ type: 'varchar', length: 64, name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ type: 'varchar', length: 64, unique: true, name: 'recognition_request_id' })
  @Index()
  recognitionRequestId!: string;

  @Column({ type: 'varchar', length: 36, name: 'device_id', nullable: true })
  deviceId?: string | null;

  @Column({ type: 'varchar', length: 36, name: 'meal_id', nullable: true })
  mealId?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  locale?: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  market?: string | null;

  @Column({ type: 'text', name: 'image_key', nullable: true })
  imageKey?: string | null;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'jsonb', name: 'request_payload_json', nullable: true })
  requestPayloadJson?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'response_payload_json', nullable: true })
  responsePayloadJson?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'error_json', nullable: true })
  errorJson?: Record<string, unknown> | null;

  @Column({ type: 'integer', name: 'latency_ms', default: 0 })
  latencyMs!: number;
}
