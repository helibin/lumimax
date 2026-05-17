import {
  DeviceCommandEntity,
  DeviceCredentialEntity,
  DeviceEntity,
  DeviceRuntimeStatusEntity,
  DeviceShadowEntity,
  DeviceStatusLogEntity,
  IotMessageEntity,
  IotProvisionRecordEntity,
} from '../common/entities/biz.entities';

export const IOT_SERVICE_ENTITIES = [
  DeviceEntity,
  DeviceCredentialEntity,
  DeviceCommandEntity,
  DeviceStatusLogEntity,
  DeviceShadowEntity,
  DeviceRuntimeStatusEntity,
  IotMessageEntity,
  IotProvisionRecordEntity,
];
