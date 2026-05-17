import { Inject, Injectable } from '@nestjs/common';
import type { CloudIotVendorName } from '@lumimax/config';
import { IotServiceGrpcClient } from '../../grpc/iot-service.grpc-client';
import type { DeviceIdentityPort } from './device-identity.port';

@Injectable()
export class IotProvisioningGrpcAdapter implements DeviceIdentityPort {
  constructor(
    @Inject(IotServiceGrpcClient)
    private readonly iotServiceGrpcClient: IotServiceGrpcClient,
  ) {}

  getStatus(): string {
    return 'iot-provisioning-via-grpc';
  }

  provisionOnDeviceCreated(
    input: Parameters<DeviceIdentityPort['provisionOnDeviceCreated']>[0],
  ): Promise<Record<string, unknown>> {
    return this.iotServiceGrpcClient.callIotAdmin({
      method: 'ProvisionOnDeviceCreated',
      payload: input,
      requestId: input.requestId,
    });
  }

  rotateDeviceCredential(
    input: Parameters<DeviceIdentityPort['rotateDeviceCredential']>[0],
  ): Promise<Record<string, unknown>> {
    return this.iotServiceGrpcClient.callIotAdmin({
      method: 'RotateDeviceCredential',
      payload: input,
      requestId: input.requestId,
    });
  }

  deleteDeviceIdentity(
    input: Parameters<DeviceIdentityPort['deleteDeviceIdentity']>[0],
  ): Promise<Record<string, unknown>> {
    return this.iotServiceGrpcClient.callIotAdmin({
      method: 'DeleteDeviceIdentity',
      payload: input,
      requestId: input.requestId,
    });
  }
}
