/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-28 18:29:16
 * @LastEditTime: 2026-04-30 11:40:03
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/libs/types/src/iot/schemas.ts
 */
type JsonSchema = Record<string, unknown>;

export const envelopeSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['meta', 'data'],
  properties: {
    meta: {
      type: 'object',
      required: ['requestId', 'deviceId', 'timestamp', 'event', 'version'],
      properties: {
        requestId: {
          type: 'string',
          minLength: 1,
          maxLength: 36,
        },
        deviceId: { type: 'string', minLength: 1, maxLength: 128 },
        timestamp: { type: 'integer', minimum: 0 },
        event: { type: 'string', minLength: 1, maxLength: 128 },
        version: { type: 'string', minLength: 1, maxLength: 32 },
        locale: { type: 'string', minLength: 2, maxLength: 32 },
      },
      additionalProperties: true,
    },
    data: { type: 'object' },
  },
};

const byEvent = (event: string, data: JsonSchema = { type: 'object', additionalProperties: true }): JsonSchema => ({
  ...envelopeSchema,
  properties: {
    ...(envelopeSchema.properties as Record<string, unknown>),
    meta: {
      ...((envelopeSchema.properties as Record<string, unknown>).meta as Record<string, unknown>),
      properties: {
        ...((((envelopeSchema.properties as Record<string, unknown>).meta as Record<string, unknown>).properties as Record<string, unknown>)),
        event: { const: event },
      },
    },
    data,
  },
});

export const iotEventSchemas: Record<string, JsonSchema> = {
  'connect.register': byEvent('connect.register'),
  'status.heartbeat': byEvent('status.heartbeat'),
  'upload.token.request': byEvent('upload.token.request'),
  'upload.url.request': byEvent('upload.url.request'),
  'attr.set.result': byEvent('attr.set.result'),
  'cmd.ota.upgrade.accepted': byEvent('cmd.ota.upgrade.accepted'),
  'cmd.ota.upgrade.progress': byEvent('cmd.ota.upgrade.progress'),
  'cmd.ota.upgrade.result': byEvent('cmd.ota.upgrade.result'),
};
