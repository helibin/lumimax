import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { DeviceEntity } from '../../common/entities/biz.entities';
import { DeviceCommandEntity } from '../../common/entities/biz.entities';
import type { DeviceCommandStatusPort } from './device-command-status.port';

@Injectable()
export class DeviceCommandService implements DeviceCommandStatusPort {
  constructor(
    @InjectRepository(DeviceCommandEntity)
    private readonly deviceCommandRepository: Repository<DeviceCommandEntity>,
  ) {}

  async createCommandEntity(input: {
    device: DeviceEntity;
    commandType: string;
    payload: Record<string, unknown>;
    requestedBy: string;
    requestId: string;
  }): Promise<DeviceCommandEntity> {
    return this.deviceCommandRepository.save(
      this.deviceCommandRepository.create({
        tenantId: input.device.tenantId,
        deviceId: input.device.id,
        commandType: input.commandType,
        payloadJson: input.payload,
        status: 'queued',
        requestedBy: input.requestedBy,
        requestedAt: new Date(),
      }),
    );
  }

  async markCommandQueued(commandId: string): Promise<DeviceCommandEntity | null> {
    const command = await this.deviceCommandRepository.findOne({ where: { id: commandId } });
    if (!command) {
      return null;
    }
    command.status = 'queued';
    command.failureReason = null;
    return this.deviceCommandRepository.save(command);
  }

  async markCommandSent(commandId: string): Promise<DeviceCommandEntity | null> {
    const command = await this.deviceCommandRepository.findOne({ where: { id: commandId } });
    if (!command) {
      return null;
    }
    command.status = 'sent';
    command.sentAt = command.sentAt ?? new Date();
    command.failureReason = null;
    return this.deviceCommandRepository.save(command);
  }

  async markCommandAccepted(commandId: string): Promise<DeviceCommandEntity | null> {
    const command = await this.deviceCommandRepository.findOne({ where: { id: commandId } });
    if (!command) {
      return null;
    }
    command.status = 'accepted';
    command.failureReason = null;
    return this.deviceCommandRepository.save(command);
  }

  async markCommandFailed(
    commandId: string,
    reason: string,
  ): Promise<DeviceCommandEntity | null> {
    const command = await this.deviceCommandRepository.findOne({ where: { id: commandId } });
    if (!command) {
      return null;
    }
    command.status = 'failed';
    command.failureReason = reason;
    return this.deviceCommandRepository.save(command);
  }

  async requestDeviceCommand(input: {
    device: DeviceEntity;
    commandType: string;
    payload: Record<string, unknown>;
    requestedBy: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    const command = await this.createCommandEntity(input);
    return this.toCommandResult(command);
  }

  async listAdminDeviceCommands(
    tenantId: string,
    deviceId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const items = await this.deviceCommandRepository.find({
      where: { tenantId, deviceId },
      order: { requestedAt: 'DESC', createdAt: 'DESC' },
      take: 50,
    });
    return items.map((item) => ({
      id: item.id,
      deviceId: item.deviceId,
      commandType: item.commandType,
      payload: item.payloadJson ?? {},
      status: item.status,
      requestedBy: item.requestedBy ?? 'system',
      requestedAt: item.requestedAt?.toISOString() ?? item.createdAt.toISOString(),
      sentAt: item.sentAt?.toISOString() ?? null,
      ackedAt: item.ackedAt?.toISOString() ?? null,
      failureReason: item.failureReason ?? null,
    }));
  }

  toCommandResult(command: DeviceCommandEntity): Record<string, unknown> {
    return {
      id: command.id,
      commandType: command.commandType,
      status: command.status,
      requestedAt: command.requestedAt?.toISOString() ?? command.createdAt.toISOString(),
    };
  }
}
