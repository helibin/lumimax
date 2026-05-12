export const BASE_PROTO_PACKAGE = 'base';
export const BIZ_PROTO_PACKAGE = 'biz';

export const BASE_PROTO_PATH = 'proto/base.proto';
export const BIZ_PROTO_PATH = 'proto/biz.proto';
export const PROTO_PACKAGE = 'lumimax-proto';
export const BASE_PROTO_FILE = 'base.proto';
export const USER_PROTO_PACKAGE = 'user';
export const USER_GRPC_SERVICE = 'UserService';
export const USER_PROTO_FILE = 'user.proto';
export const DEVICE_PROTO_PACKAGE = 'device';
export const DEVICE_GRPC_SERVICE = 'DeviceService';
export const DEVICE_PROTO_FILE = 'device.proto';
export const NOTIFICATION_PROTO_PACKAGE = 'notification';
export const NOTIFICATION_GRPC_SERVICE = 'NotificationService';
export const NOTIFICATION_PROTO_FILE = 'notification.proto';
export const IOT_BRIDGE_PROTO_PACKAGE = 'iotbridge';
export const IOT_BRIDGE_GRPC_SERVICE = 'IotBridgeService';
export const IOT_BRIDGE_PROTO_FILE = 'iot-bridge.proto';
export const IOT_BRIDGE_ADMIN_MESSAGE_GRPC_SERVICE = 'AdminIotMessageService';
export const STORAGE_PROTO_PACKAGE = 'storage';
export const STORAGE_GRPC_SERVICE = 'StorageService';
export const STORAGE_PROTO_FILE = 'storage.proto';
export const DIET_PROTO_PACKAGE = 'diet';
export const DIET_GRPC_SERVICE = 'DietService';
export const DIET_PROTO_FILE = 'diet.proto';
export const DIET_ADMIN_MEAL_GRPC_SERVICE = 'AdminMealService';
export const DIET_ADMIN_FOOD_GRPC_SERVICE = 'AdminFoodService';
export const DIET_ADMIN_RECOGNITION_LOG_GRPC_SERVICE = 'AdminRecognitionLogService';
export const NUTRITION_PROTO_PACKAGE = DIET_PROTO_PACKAGE;
export const NUTRITION_GRPC_SERVICE = DIET_GRPC_SERVICE;
export const NUTRITION_PROTO_FILE = DIET_PROTO_FILE;
export const SYSTEM_PROTO_PACKAGE = 'system.v1';
export const SYSTEM_GRPC_SERVICE = 'DictionaryService';
export const SYSTEM_PROTO_FILE = 'system.proto';
export const SYSTEM_ADMIN_AUTH_GRPC_SERVICE = 'AdminAuthService';
export const SYSTEM_ADMIN_ACCOUNT_GRPC_SERVICE = 'AdminAccountService';
export const SYSTEM_ADMIN_ROLE_GRPC_SERVICE = 'AdminRoleService';
export const SYSTEM_ADMIN_PERMISSION_GRPC_SERVICE = 'AdminPermissionService';
export const SYSTEM_ADMIN_DICTIONARY_GRPC_SERVICE = 'AdminDictionaryService';
export const SYSTEM_ADMIN_CONFIG_GRPC_SERVICE = 'AdminSystemConfigService';
export const SYSTEM_ADMIN_AUDIT_LOG_GRPC_SERVICE = 'AdminAuditLogService';

export const BASE_GRPC_SERVICES = {
  admin: 'BaseSystemFacadeService',
  health: 'BaseHealthService',
  notification: 'BaseNotificationFacadeService',
  storage: 'BaseStorageFacadeService',
  user: 'BaseUserFacadeService',
} as const;

export const BIZ_GRPC_SERVICES = {
  device: 'BizDeviceFacadeService',
  diet: 'BizDietFacadeService',
  health: 'BizHealthService',
  iot: 'BizIotFacadeService',
} as const;
