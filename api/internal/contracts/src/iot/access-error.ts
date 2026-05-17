import { BusinessCode, type BusinessError, type BusinessErrorKey } from '../response/business-code';

export interface IotAccessErrorDefinition extends BusinessError {
  reasons: string[];
}

const IOT_ACCESS_ERROR_DEFINITIONS: IotAccessErrorDefinition[] = [
  {
    code: BusinessCode.IOT_TOPIC_INVALID,
    key: 'iot.topic_invalid',
    reasons: [
      'invalid_action',
      'missing_topic',
      'invalid_topic',
      'unsupported_topic_version',
      'missing_topic_device_id',
      'unsupported_topic_kind',
    ],
  },
  {
    code: BusinessCode.IOT_TOPIC_FORBIDDEN,
    key: 'iot.topic_forbidden',
    reasons: [
      'topic_device_id_mismatch',
      'topic_action_not_allowed',
      'device_limited_to_connect_topics',
    ],
  },
  {
    code: BusinessCode.IOT_DEVICE_NOT_FOUND,
    key: 'iot.device_not_found',
    reasons: [
      'device_not_found',
    ],
  },
  {
    code: BusinessCode.IOT_DEVICE_CONNECTION_DISABLED,
    key: 'iot.device_connection_disabled',
    reasons: [
      'device_connection_disabled',
    ],
  },
  {
    code: BusinessCode.IOT_CREDENTIAL_NOT_MATCHED,
    key: 'iot.credential_not_matched',
    reasons: [
      'credential_not_matched',
      'active_credential_not_found',
      'certificate_fingerprint_mismatch',
      'credential_id_mismatch',
    ],
  },
  {
    code: BusinessCode.IOT_CREDENTIAL_INACTIVE,
    key: 'iot.credential_inactive',
    reasons: [
      'credential_inactive',
    ],
  },
];

const IOT_ACCESS_ERROR_BY_REASON = new Map<string, IotAccessErrorDefinition>();
for (const definition of IOT_ACCESS_ERROR_DEFINITIONS) {
  for (const reason of definition.reasons) {
    IOT_ACCESS_ERROR_BY_REASON.set(reason, definition);
  }
}

export function getIotAccessErrorByReason(reason?: string | null): IotAccessErrorDefinition | undefined {
  if (!reason) {
    return undefined;
  }
  return IOT_ACCESS_ERROR_BY_REASON.get(reason);
}

export function toIotAccessBusinessError(reason?: string | null): BusinessError | undefined {
  const definition = getIotAccessErrorByReason(reason);
  if (!definition) {
    return undefined;
  }
  return {
    code: definition.code,
    key: definition.key as BusinessErrorKey,
  };
}
