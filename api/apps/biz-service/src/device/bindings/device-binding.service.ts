import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { DeviceBindingEntity } from '../../common/entities/biz.entities';

@Injectable()
export class DeviceBindingService {
  constructor(
    @InjectRepository(DeviceBindingEntity)
    private readonly deviceBindingRepository: Repository<DeviceBindingEntity>,
  ) {}

  async appendBinding(
    tenantId: string,
    deviceId: string,
    userId: string,
    requestId: string,
  ): Promise<void> {
    await this.closeActiveBindings(tenantId, deviceId, requestId);
    await this.deviceBindingRepository.save(
      this.deviceBindingRepository.create({
        tenantId,
        deviceId,
        userId,
        status: 'active',
        boundAt: new Date(),
      }),
    );
  }

  async closeActiveBinding(
    tenantId: string,
    deviceId: string,
    userId: string,
    _requestId: string,
  ): Promise<void> {
    const activeBinding = await this.deviceBindingRepository.findOne({
      where: { tenantId, deviceId, userId, status: 'active' },
      order: { createdAt: 'DESC' },
    });
    if (!activeBinding || activeBinding.unboundAt) {
      return;
    }
    activeBinding.status = 'inactive';
    activeBinding.unboundAt = new Date();
    await this.deviceBindingRepository.save(activeBinding);
  }

  async closeActiveBindings(
    tenantId: string,
    deviceId: string,
    _requestId: string,
  ): Promise<void> {
    const bindings = await this.deviceBindingRepository.find({
      where: { tenantId, deviceId, status: 'active' },
    });
    if (bindings.length === 0) {
      return;
    }
    const now = new Date();
    for (const binding of bindings) {
      binding.status = 'inactive';
      binding.unboundAt = binding.unboundAt ?? now;
    }
    await this.deviceBindingRepository.save(bindings);
  }
}
