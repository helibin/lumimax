import { Inject, Injectable } from '@nestjs/common';
import { normalizeIotVendor } from '@lumimax/config';
import { IotEgressAdapterRegistry } from '@lumimax/iot-kit';
import type { CloudIotVendorName } from '../iot.types';
import type { IotBridgeDownlinkCommandMessage } from '../transport/iot-bridge.rabbitmq';
import { IotDownlinkService } from '../transport/iot-downlink.service';

@Injectable()
export class DownlinkDispatchService {
  constructor(
    @Inject(IotDownlinkService)
    private readonly iotDownlinkService: IotDownlinkService,
    @Inject(IotEgressAdapterRegistry)
    private readonly iotEgressAdapterRegistry: IotEgressAdapterRegistry,
  ) {}

  async dispatch(payload: IotBridgeDownlinkCommandMessage): Promise<CloudIotVendorName> {
    const device = await this.iotDownlinkService.resolveDeviceByIdOrSn(payload.deviceId);
    if (!device) {
      throw new Error(`device not found: ${payload.deviceId}`);
    }
    const vendor = payload.provider !== 'auto'
      ? normalizeIotVendor(payload.provider)
      : normalizeIotVendor(device.provider);
    await this.iotEgressAdapterRegistry.getOrThrow(vendor).publishDownstream({
      deviceId: payload.deviceId,
      deviceName: device.deviceSn ?? device.id,
      productKey: device.productKey ?? undefined,
      topic: payload.topic,
      payload: payload.payload,
      qos: payload.qos ?? 1,
      requestId: payload.requestId,
    });
    return vendor;
  }
}
