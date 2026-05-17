import { Module } from '@nestjs/common';
import { DEVICE_IDENTITY_PORT } from './device-identity.port';
import { IotProvisioningGrpcAdapter } from './iot-provisioning.grpc-adapter';
import { IotServiceGrpcClient, iotServiceGrpcClientRegistration } from '../../grpc/iot-service.grpc-client';

@Module({
  imports: [iotServiceGrpcClientRegistration],
  providers: [
    IotServiceGrpcClient,
    IotProvisioningGrpcAdapter,
    {
      provide: DEVICE_IDENTITY_PORT,
      useExisting: IotProvisioningGrpcAdapter,
    },
  ],
  exports: [
    IotServiceGrpcClient,
    IotProvisioningGrpcAdapter,
    DEVICE_IDENTITY_PORT,
  ],
})
export class DeviceIdentityModule {}
