CREATE TABLE IF NOT EXISTS audit_logs (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  actor_user_id varchar(36),
  actor_type varchar(16) NOT NULL,
  action varchar(128) NOT NULL,
  resource_type varchar(64) NOT NULL,
  resource_id varchar(64),
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS consent_records (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  user_id varchar(36) NOT NULL,
  consent_type varchar(64) NOT NULL,
  consent_version varchar(32) NOT NULL,
  granted boolean NOT NULL,
  granted_at timestamp(3) without time zone NOT NULL,
  revoked_at timestamp(3) without time zone,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT consent_records_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_consent_records_tenant_id ON public.consent_records USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_consent_records_user_id ON public.consent_records USING btree (user_id);

CREATE TABLE IF NOT EXISTS device_bindings (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  device_id varchar(36) NOT NULL,
  user_id varchar(36) NOT NULL,
  status varchar(32) DEFAULT 'active'::character varying NOT NULL,
  bound_at timestamp(3) without time zone,
  unbound_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT device_bindings_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_device_bindings_device_id ON public.device_bindings USING btree (device_id);

CREATE INDEX IF NOT EXISTS idx_device_bindings_tenant_id ON public.device_bindings USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_device_bindings_user_id ON public.device_bindings USING btree (user_id);

CREATE TABLE IF NOT EXISTS device_commands (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  device_id varchar(36) NOT NULL,
  command_type varchar(128) NOT NULL,
  payload_json jsonb,
  status varchar(32) DEFAULT 'pending'::character varying NOT NULL,
  requested_by varchar(36),
  requested_at timestamp(3) without time zone,
  sent_at timestamp(3) without time zone,
  acked_at timestamp(3) without time zone,
  failure_reason text,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT device_commands_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_device_commands_device_id ON public.device_commands USING btree (device_id);

CREATE INDEX IF NOT EXISTS idx_device_commands_tenant_id ON public.device_commands USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS device_credentials (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  tenant_id varchar(64) NOT NULL,
  device_id varchar(36) NOT NULL,
  vendor varchar(32) NOT NULL,
  credential_type varchar(32) DEFAULT 'certificate'::character varying NOT NULL,
  credential_id varchar(128),
  thing_name varchar(255),
  certificate_arn varchar(255),
  certificate_pem text,
  private_key_pem text,
  endpoint varchar(255),
  region varchar(64),
  fingerprint varchar(128),
  status varchar(32) DEFAULT 'active'::character varying NOT NULL,
  issued_at timestamp(3) without time zone,
  expires_at timestamp(3) without time zone,
  metadata_json jsonb,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  CONSTRAINT device_credentials_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_device_credentials_device_id ON public.device_credentials USING btree (device_id);

CREATE INDEX IF NOT EXISTS idx_device_credentials_tenant_id ON public.device_credentials USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS device_runtime_statuses (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  device_id varchar(36) NOT NULL,
  battery_level integer,
  firmware_version varchar(64),
  hardware_version varchar(64),
  protocol_version varchar(64),
  rssi integer,
  temperature numeric(10,3),
  network_status varchar(32),
  payload_json jsonb,
  reported_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT device_runtime_statuses_pkey PRIMARY KEY (id),
  CONSTRAINT device_runtime_statuses_device_id_key UNIQUE (device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_runtime_statuses_device_id ON public.device_runtime_statuses USING btree (device_id);

CREATE INDEX IF NOT EXISTS idx_device_runtime_statuses_tenant_id ON public.device_runtime_statuses USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS device_shadows (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  device_id varchar(36) NOT NULL,
  reported jsonb DEFAULT '{}'::jsonb NOT NULL,
  desired jsonb DEFAULT '{}'::jsonb NOT NULL,
  shadow_version integer DEFAULT 1 NOT NULL,
  source_provider varchar(32) NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT device_shadows_pkey PRIMARY KEY (id),
  CONSTRAINT device_shadows_device_id_key UNIQUE (device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_shadows_device_id ON public.device_shadows USING btree (device_id);

CREATE INDEX IF NOT EXISTS idx_device_shadows_tenant_id ON public.device_shadows USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS device_status_logs (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  device_id varchar(36) NOT NULL,
  online_status varchar(32) NOT NULL,
  device_status varchar(32) NOT NULL,
  payload_json jsonb,
  reported_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT device_status_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_device_status_logs_device_id ON public.device_status_logs USING btree (device_id);

CREATE INDEX IF NOT EXISTS idx_device_status_logs_tenant_id ON public.device_status_logs USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS device_tokens (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  user_id varchar(36) NOT NULL,
  platform varchar(16) NOT NULL,
  provider varchar(16) NOT NULL,
  token varchar(512) NOT NULL,
  app_id varchar(128),
  region varchar(32),
  locale varchar(16),
  is_active boolean DEFAULT true NOT NULL,
  last_seen_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT device_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT device_tokens_token_key UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_tenant_id ON public.device_tokens USING btree (tenant_id);

CREATE UNIQUE INDEX idx_device_tokens_token ON public.device_tokens USING btree (token);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens USING btree (user_id);

CREATE TABLE IF NOT EXISTS devices (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  device_sn varchar(64) NOT NULL,
  product_key varchar(64) NOT NULL,
  provider varchar(32) NOT NULL,
  status varchar(32) DEFAULT 'inactive'::character varying NOT NULL,
  online_status varchar(32) DEFAULT 'offline'::character varying NOT NULL,
  bound_user_id varchar(36),
  last_seen_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  name varchar(128) DEFAULT ''::character varying NOT NULL,
  CONSTRAINT devices_pkey PRIMARY KEY (id),
  CONSTRAINT devices_device_sn_key UNIQUE (device_sn)
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON public.devices USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS external_food_mappings (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  food_id varchar(36) NOT NULL,
  provider_code varchar(64) NOT NULL,
  external_food_id varchar(128) NOT NULL,
  external_name varchar(255),
  country_code varchar(16),
  locale varchar(16),
  raw_payload jsonb,
  confidence numeric(5,2) DEFAULT 0.8 NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT external_food_mappings_pkey PRIMARY KEY (id),
  CONSTRAINT uq_external_food_mappings_food_provider_external UNIQUE (food_id, provider_code, external_food_id)
);

CREATE INDEX IF NOT EXISTS idx_external_food_mappings_external_food_id ON public.external_food_mappings USING btree (external_food_id);

CREATE INDEX IF NOT EXISTS idx_external_food_mappings_food_id ON public.external_food_mappings USING btree (food_id);

CREATE INDEX IF NOT EXISTS idx_external_food_mappings_provider_code ON public.external_food_mappings USING btree (provider_code);

CREATE INDEX IF NOT EXISTS idx_external_food_mappings_tenant_id ON public.external_food_mappings USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS food_aliases (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  food_id varchar(36) NOT NULL,
  alias varchar(128) NOT NULL,
  normalized_alias varchar(128) NOT NULL,
  locale varchar(16),
  country_code varchar(16),
  source varchar(64),
  confidence numeric(5,2) DEFAULT 0.8 NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT food_aliases_pkey PRIMARY KEY (id),
  CONSTRAINT uq_food_aliases_food_id_normalized_alias UNIQUE (food_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_food_aliases_alias ON public.food_aliases USING btree (alias);

CREATE INDEX IF NOT EXISTS idx_food_aliases_food_id ON public.food_aliases USING btree (food_id);

CREATE INDEX IF NOT EXISTS idx_food_aliases_normalized_alias ON public.food_aliases USING btree (normalized_alias);

CREATE INDEX IF NOT EXISTS idx_food_aliases_tenant_id ON public.food_aliases USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS food_corrections (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  user_id varchar(36),
  meal_id varchar(36),
  meal_item_id varchar(36),
  original_food_name varchar(128),
  corrected_food_name varchar(128),
  original_weight_gram numeric(12,2),
  corrected_weight_gram numeric(12,2),
  original_provider_code varchar(64),
  corrected_provider_code varchar(64),
  correction_type varchar(64) DEFAULT 'manual_confirm'::character varying NOT NULL,
  extra_json jsonb,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT food_corrections_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_food_corrections_meal_id ON public.food_corrections USING btree (meal_id);

CREATE INDEX IF NOT EXISTS idx_food_corrections_meal_item_id ON public.food_corrections USING btree (meal_item_id);

CREATE INDEX IF NOT EXISTS idx_food_corrections_tenant_id ON public.food_corrections USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_food_corrections_user_id ON public.food_corrections USING btree (user_id);

CREATE TABLE IF NOT EXISTS food_locale_names (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  food_id varchar(36) NOT NULL,
  locale varchar(16) NOT NULL,
  country_code varchar(16),
  display_name varchar(128) NOT NULL,
  normalized_name varchar(128) NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT food_locale_names_pkey PRIMARY KEY (id),
  CONSTRAINT uq_food_locale_names_food_id_locale_normalized_name UNIQUE (food_id, locale, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_food_locale_names_food_id ON public.food_locale_names USING btree (food_id);

CREATE INDEX IF NOT EXISTS idx_food_locale_names_normalized_name ON public.food_locale_names USING btree (normalized_name);

CREATE INDEX IF NOT EXISTS idx_food_locale_names_tenant_id ON public.food_locale_names USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS food_nutritions (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  food_id varchar(36) NOT NULL,
  calories_per_100g numeric(12,2) DEFAULT 0 NOT NULL,
  protein_per_100g numeric(12,2) DEFAULT 0 NOT NULL,
  fat_per_100g numeric(12,2) DEFAULT 0 NOT NULL,
  carbs_per_100g numeric(12,2) DEFAULT 0 NOT NULL,
  extra_json jsonb,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT food_nutritions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_food_nutritions_food_id ON public.food_nutritions USING btree (food_id);

CREATE INDEX IF NOT EXISTS idx_food_nutritions_tenant_id ON public.food_nutritions USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS foods (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  name varchar(128) NOT NULL,
  brand varchar(128),
  country_code varchar(16),
  source varchar(64),
  status varchar(32) DEFAULT 'active'::character varying NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT foods_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_foods_name ON public.foods USING btree (name);

CREATE INDEX IF NOT EXISTS idx_foods_tenant_id ON public.foods USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS iot_messages (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  message_key varchar(64) NOT NULL,
  device_id varchar(128),
  direction varchar(32) NOT NULL,
  topic varchar(255) NOT NULL,
  event varchar(64) NOT NULL,
  status varchar(32) DEFAULT 'received'::character varying NOT NULL,
  payload_json jsonb,
  result_json jsonb,
  error_json jsonb,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT iot_messages_pkey PRIMARY KEY (id),
  CONSTRAINT iot_messages_message_key_key UNIQUE (message_key)
);

CREATE INDEX IF NOT EXISTS idx_iot_messages_tenant_id ON public.iot_messages USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS iot_provision_records (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  device_id varchar(36) NOT NULL,
  vendor varchar(32) NOT NULL,
  status varchar(32) DEFAULT 'created'::character varying NOT NULL,
  request_payload_json jsonb,
  response_payload_json jsonb,
  error_json jsonb,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT iot_provision_records_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_iot_provision_records_device_id ON public.iot_provision_records USING btree (device_id);

CREATE INDEX IF NOT EXISTS idx_iot_provision_records_tenant_id ON public.iot_provision_records USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS meal_items (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  meal_record_id varchar(36) NOT NULL,
  food_name varchar(128) NOT NULL,
  weight numeric(12,2) NOT NULL,
  image_key text,
  image_object_id text,
  user_id varchar(36),
  device_id varchar(36),
  calories numeric(12,2) DEFAULT 0 NOT NULL,
  protein numeric(12,2) DEFAULT 0 NOT NULL,
  fat numeric(12,2) DEFAULT 0 NOT NULL,
  carbs numeric(12,2) DEFAULT 0 NOT NULL,
  source varchar(64),
  recognition_status varchar(32) DEFAULT 'success'::character varying NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT meal_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_meal_items_meal_record_id ON public.meal_items USING btree (meal_record_id);

CREATE INDEX IF NOT EXISTS idx_meal_items_tenant_id ON public.meal_items USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS meal_records (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  user_id varchar(36),
  device_id varchar(36),
  status varchar(32) DEFAULT 'created'::character varying NOT NULL,
  started_at timestamp(3) without time zone,
  finished_at timestamp(3) without time zone,
  total_calories numeric(12,2) DEFAULT 0 NOT NULL,
  total_weight numeric(12,2) DEFAULT 0 NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT meal_records_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_meal_records_device_id ON public.meal_records USING btree (device_id);

CREATE INDEX IF NOT EXISTS idx_meal_records_tenant_id ON public.meal_records USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_meal_records_user_id ON public.meal_records USING btree (user_id);

CREATE TABLE IF NOT EXISTS notification_messages (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  user_id varchar(36) NOT NULL,
  tenant_id varchar(64),
  event_name varchar(128) NOT NULL,
  template_code varchar(128) NOT NULL,
  title varchar(255) DEFAULT ''::character varying NOT NULL,
  content text DEFAULT ''::text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status varchar(32) DEFAULT 'pending'::character varying NOT NULL,
  scheduled_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  CONSTRAINT notification_messages_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_notification_messages_tenant_id ON public.notification_messages USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_notification_messages_user_id ON public.notification_messages USING btree (user_id);

CREATE TABLE IF NOT EXISTS notification_templates (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  code varchar(128) NOT NULL,
  channel varchar(16) NOT NULL,
  locale varchar(16) DEFAULT 'zh-CN'::character varying NOT NULL,
  title_template text NOT NULL,
  content_template text NOT NULL,
  variables_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_enabled boolean DEFAULT true NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT notification_templates_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_code ON public.notification_templates USING btree (code);

CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant_id ON public.notification_templates USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  user_id varchar(36) NOT NULL,
  verify_type varchar(16) NOT NULL,
  target varchar(255) NOT NULL,
  scene varchar(64) DEFAULT ''::character varying NOT NULL,
  code_hash varchar(128) NOT NULL,
  expires_at timestamp(3) without time zone NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  max_attempts integer DEFAULT 5 NOT NULL,
  consumed_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT otp_codes_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON public.otp_codes USING btree (expires_at);

CREATE INDEX IF NOT EXISTS idx_otp_codes_scene ON public.otp_codes USING btree (scene);

CREATE INDEX IF NOT EXISTS idx_otp_codes_target ON public.otp_codes USING btree (target);

CREATE INDEX IF NOT EXISTS idx_otp_codes_tenant_id ON public.otp_codes USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_id ON public.otp_codes USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_otp_codes_verify_type ON public.otp_codes USING btree (verify_type);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  user_id varchar(36) NOT NULL,
  type varchar(32) NOT NULL,
  status varchar(32) DEFAULT 'pending'::character varying NOT NULL,
  submitted_at timestamp(3) without time zone NOT NULL,
  completed_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT privacy_requests_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_tenant_id ON public.privacy_requests USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_user_id ON public.privacy_requests USING btree (user_id);

CREATE TABLE IF NOT EXISTS recognition_logs (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  recognition_request_id varchar(64) NOT NULL,
  device_id varchar(36),
  meal_id varchar(36),
  image_key text,
  provider varchar(32) NOT NULL,
  status varchar(32) NOT NULL,
  request_payload_json jsonb,
  response_payload_json jsonb,
  error_json jsonb,
  latency_ms integer DEFAULT 0 NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64) NOT NULL,
  CONSTRAINT recognition_logs_pkey PRIMARY KEY (id),
  CONSTRAINT recognition_logs_recognition_request_id_key UNIQUE (recognition_request_id)
);

CREATE INDEX IF NOT EXISTS idx_recognition_logs_device_id ON public.recognition_logs USING btree (device_id);

CREATE INDEX IF NOT EXISTS idx_recognition_logs_meal_id ON public.recognition_logs USING btree (meal_id);

CREATE INDEX IF NOT EXISTS idx_recognition_logs_tenant_id ON public.recognition_logs USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  user_id varchar(36) NOT NULL,
  token_hash varchar(128) NOT NULL,
  status varchar(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
  expires_at timestamp(3) without time zone NOT NULL,
  used_at timestamp(3) without time zone,
  revoked_at timestamp(3) without time zone,
  replaced_by_id varchar(36),
  issued_ip varchar(64),
  issued_user_agent varchar(255),
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant_id ON public.refresh_tokens USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);

CREATE TABLE IF NOT EXISTS storage_objects (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  object_key text NOT NULL,
  provider varchar(32) NOT NULL,
  bucket varchar(128) NOT NULL,
  region varchar(64) NOT NULL,
  owner_type varchar(32) NOT NULL,
  owner_id varchar(36) NOT NULL,
  status varchar(32) DEFAULT 'pending'::character varying NOT NULL,
  user_id varchar(36),
  device_id varchar(36),
  biz_type varchar(64),
  biz_id varchar(36),
  media_type varchar(32),
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT storage_objects_pkey PRIMARY KEY (id),
  CONSTRAINT storage_objects_object_key_key UNIQUE (object_key)
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_tenant_id ON public.storage_objects USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_admin_roles (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  admin_id varchar(36) NOT NULL,
  role_id varchar(36) NOT NULL,
  assigned_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_admin_roles_pkey PRIMARY KEY (id),
  CONSTRAINT uq_system_admin_roles_admin_id_role_id UNIQUE (admin_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_system_admin_roles_admin_id ON public.system_admin_roles USING btree (admin_id);

CREATE INDEX IF NOT EXISTS idx_system_admin_roles_role_id ON public.system_admin_roles USING btree (role_id);

CREATE INDEX IF NOT EXISTS idx_system_admin_roles_tenant_id ON public.system_admin_roles USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_admins (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  username varchar(64) NOT NULL,
  password_hash varchar(255) NOT NULL,
  nickname varchar(64) NOT NULL,
  email varchar(128),
  phone varchar(32),
  status varchar(32) DEFAULT 'active'::character varying NOT NULL,
  last_login_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_admins_pkey PRIMARY KEY (id),
  CONSTRAINT system_admins_email_key UNIQUE (email),
  CONSTRAINT system_admins_phone_key UNIQUE (phone),
  CONSTRAINT system_admins_username_key UNIQUE (username)
);

CREATE INDEX IF NOT EXISTS idx_system_admins_tenant_id ON public.system_admins USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_audit_logs (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  operator_id varchar(36) NOT NULL,
  operator_name varchar(64) NOT NULL,
  action varchar(64) NOT NULL,
  resource_type varchar(64) NOT NULL,
  resource_id varchar(36),
  before_json jsonb,
  after_json jsonb,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_audit_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_tenant_id ON public.system_audit_logs USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_configs (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  config_key varchar(128) NOT NULL,
  config_value text NOT NULL,
  value_type varchar(32) NOT NULL,
  group_code varchar(64) NOT NULL,
  name varchar(64) NOT NULL,
  description varchar(255),
  is_encrypted boolean DEFAULT false NOT NULL,
  status varchar(32) DEFAULT 'active'::character varying NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_configs_pkey PRIMARY KEY (id),
  CONSTRAINT system_configs_config_key_key UNIQUE (config_key)
);

CREATE INDEX IF NOT EXISTS idx_system_configs_tenant_id ON public.system_configs USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_dictionaries (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  code varchar(64) NOT NULL,
  name varchar(64) NOT NULL,
  description varchar(255),
  status varchar(32) DEFAULT 'active'::character varying NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_dictionaries_pkey PRIMARY KEY (id),
  CONSTRAINT system_dictionaries_code_key UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_system_dictionaries_tenant_id ON public.system_dictionaries USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_dictionary_items (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  dictionary_code varchar(64) NOT NULL,
  label varchar(64) NOT NULL,
  value varchar(64) NOT NULL,
  sort integer DEFAULT 0 NOT NULL,
  status varchar(32) DEFAULT 'active'::character varying NOT NULL,
  extra_json jsonb,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_dictionary_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_system_dictionary_items_dictionary_code ON public.system_dictionary_items USING btree (dictionary_code);

CREATE INDEX IF NOT EXISTS idx_system_dictionary_items_tenant_id ON public.system_dictionary_items USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_menus (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  code varchar(64) NOT NULL,
  name varchar(64) NOT NULL,
  parent_id varchar(36),
  menu_type varchar(16) DEFAULT 'menu'::character varying NOT NULL,
  route_path varchar(255),
  component varchar(255),
  icon varchar(64),
  permission_code varchar(64),
  sort integer DEFAULT 0 NOT NULL,
  visible boolean DEFAULT true NOT NULL,
  keep_alive boolean DEFAULT false NOT NULL,
  external_link varchar(255),
  status varchar(32) DEFAULT 'active'::character varying NOT NULL,
  extra_json jsonb,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_menus_pkey PRIMARY KEY (id),
  CONSTRAINT system_menus_code_key UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_system_menus_code ON public.system_menus USING btree (code);

CREATE INDEX IF NOT EXISTS idx_system_menus_parent_id ON public.system_menus USING btree (parent_id);

CREATE INDEX IF NOT EXISTS idx_system_menus_tenant_id ON public.system_menus USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_permissions (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  code varchar(64) NOT NULL,
  name varchar(64) NOT NULL,
  group_code varchar(64) NOT NULL,
  description varchar(255),
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT system_permissions_code_key UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_system_permissions_tenant_id ON public.system_permissions USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_role_menus (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  role_id varchar(36) NOT NULL,
  menu_id varchar(36) NOT NULL,
  assigned_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_role_menus_pkey PRIMARY KEY (id),
  CONSTRAINT uq_system_role_menus_role_id_menu_id UNIQUE (role_id, menu_id)
);

CREATE INDEX IF NOT EXISTS idx_system_role_menus_menu_id ON public.system_role_menus USING btree (menu_id);

CREATE INDEX IF NOT EXISTS idx_system_role_menus_role_id ON public.system_role_menus USING btree (role_id);

CREATE INDEX IF NOT EXISTS idx_system_role_menus_tenant_id ON public.system_role_menus USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_role_permissions (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  role_id varchar(36) NOT NULL,
  permission_id varchar(36) NOT NULL,
  assigned_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_role_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT uq_system_role_permissions_role_id_permission_id UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_system_role_permissions_permission_id ON public.system_role_permissions USING btree (permission_id);

CREATE INDEX IF NOT EXISTS idx_system_role_permissions_role_id ON public.system_role_permissions USING btree (role_id);

CREATE INDEX IF NOT EXISTS idx_system_role_permissions_tenant_id ON public.system_role_permissions USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS system_roles (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  code varchar(64) NOT NULL,
  name varchar(64) NOT NULL,
  description varchar(255),
  status varchar(32) DEFAULT 'active'::character varying NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT system_roles_pkey PRIMARY KEY (id),
  CONSTRAINT system_roles_code_key UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_system_roles_tenant_id ON public.system_roles USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS third_party_identities (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  user_id varchar(36) NOT NULL,
  provider varchar(16) NOT NULL,
  provider_user_id varchar(191) NOT NULL,
  union_id varchar(191),
  open_id varchar(191),
  email varchar(191),
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  tenant_id varchar(64),
  CONSTRAINT third_party_identities_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_third_party_identities_provider_user_id ON public.third_party_identities USING btree (provider_user_id);

CREATE INDEX IF NOT EXISTS idx_third_party_identities_tenant_id ON public.third_party_identities USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_third_party_identities_user_id ON public.third_party_identities USING btree (user_id);

CREATE TABLE IF NOT EXISTS users (
  id varchar(36) NOT NULL,
  creator_id varchar(36),
  editor_id varchar(36),
  is_disabled boolean DEFAULT false NOT NULL,
  remark varchar(500),
  username varchar(128) NOT NULL,
  password_hash text NOT NULL,
  type smallint NOT NULL,
  status varchar(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
  tenant_id varchar(64),
  last_login_at timestamp(3) without time zone,
  last_active_at timestamp(3) without time zone,
  created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  updated_at timestamp(3) without time zone DEFAULT now() NOT NULL,
  deleted_at timestamp(3) without time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_username_key UNIQUE (username)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users USING btree (tenant_id);
