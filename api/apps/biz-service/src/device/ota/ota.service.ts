import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { DeviceEntity } from '../../common/entities/biz.entities';
import { DeviceCommandEntity } from '../../common/entities/biz.entities';
import { DeviceCommandService } from '../commands/device-command.service';

@Injectable()
export class OtaService {
  constructor(
    @InjectRepository(DeviceCommandEntity)
    private readonly deviceCommandRepository: Repository<DeviceCommandEntity>,
    @Inject(DeviceCommandService)
    private readonly deviceCommandService: DeviceCommandService,
  ) {}

  async createOtaUpgradeCommand(
    device: DeviceEntity,
    body: Record<string, unknown>,
    _requestId: string,
  ): Promise<DeviceCommandEntity> {
    return this.deviceCommandRepository.save(
      this.deviceCommandRepository.create({
        tenantId: device.tenantId,
        deviceId: device.id,
        commandType: 'ota_upgrade',
        payloadJson: {
          targetVersion: pickString(body.targetVersion) ?? null,
          packageUrl: pickString(body.packageUrl) ?? null,
          checksum: pickString(body.checksum) ?? null,
          force: body.force === true,
        },
        status: 'queued',
        requestedBy: 'admin',
        requestedAt: new Date(),
      }),
    );
  }

  async findLatestOtaCommand(
    tenantId: string,
    deviceId: string,
  ): Promise<DeviceCommandEntity | null> {
    return this.deviceCommandRepository.findOne({
      where: { tenantId, deviceId, commandType: 'ota_upgrade' },
      order: { createdAt: 'DESC' },
    });
  }

  async cancelOtaCommand(command: DeviceCommandEntity, _requestId: string): Promise<DeviceCommandEntity> {
    command.status = 'failed';
    command.failureReason = 'cancelled';
    return this.deviceCommandRepository.save(command);
  }

  async listOtaTasks(
    tenantId: string,
    deviceId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const items = await this.deviceCommandRepository.find({
      where: { tenantId, deviceId, commandType: 'ota_upgrade' },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return items.map((item) => ({
      id: item.id,
      deviceId: item.deviceId,
      status: item.status,
      requestedAt: item.requestedAt?.toISOString() ?? item.createdAt.toISOString(),
      sentAt: item.sentAt?.toISOString() ?? null,
      failureReason: item.failureReason ?? null,
      payload: item.payloadJson ?? {},
    }));
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
