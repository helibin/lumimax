export const RABBITMQ_CLIENT = 'RABBITMQ_CLIENT';

export const RABBITMQ_DEFAULT_URL = 'amqp://guest:guest@localhost:5672';
export const RABBITMQ_DEFAULT_EVENTS_EXCHANGE = 'app.events';
export const RABBITMQ_DEFAULT_EVENTS_EXCHANGE_TYPE = 'topic';
export const RABBITMQ_DEFAULT_PUBLISHER_QUEUE_SUFFIX = '.events.publisher';

export const RABBITMQ_EVENT_KEYS = {
  ORDER_CREATED: 'order.created',
  ORDER_PAID: 'order.paid',
  PAYMENT_SUCCESS: 'payment.success',
  NOTIFICATION_OTP_SEND: 'notification.otp.send',
  AUDIT_ADMIN_ACTION: 'audit.admin.action',
  DEVICE_TELEMETRY_REPORTED: 'device.telemetry.reported',
  DEVICE_STATUS_CHANGED: 'device.status.changed',
  DEVICE_COMMAND_REQUESTED: 'device.command.requested',
  DEVICE_COMMAND_ACK: 'device.command.ack',
  DEVICE_SHADOW_SYNCED: 'device.shadow.synced',
  DEVICE_OTA_PROGRESS_REPORTED: 'device.ota.progress.reported',
  DEVICE_CONNECT_REGISTERED: 'device.connect.registered',
  DEVICE_HEARTBEAT_RECEIVED: 'device.heartbeat.received',
  DEVICE_ANALYSIS_COMPLETED: 'device.analysis.completed',
  DEVICE_OTA_ACCEPTED: 'device.ota.accepted',
  DEVICE_OTA_PROGRESS: 'device.ota.progress',
  DEVICE_OTA_RESULT: 'device.ota.result',
  DEVICE_OTA_CANCEL_RESULT: 'device.ota.cancel.result',
  STORAGE_UPLOAD_TOKEN_REQUESTED: 'storage.upload.token.requested',
  STORAGE_UPLOAD_TOKEN_ISSUED: 'storage.upload.token.issued',
  USER_DELETION_REQUESTED: 'user.deletion.requested',
  DEVICE_DELETION_REQUESTED: 'device.deletion.requested',
} as const;

export type RabbitMQEventName =
  (typeof RABBITMQ_EVENT_KEYS)[keyof typeof RABBITMQ_EVENT_KEYS];
