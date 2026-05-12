/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-05-02 15:29:24
 * @LastEditTime: 2026-05-02 19:06:46
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/apps/biz-service/src/device/telemetry/device-presence-monitor.service.ts
 */
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { getEnvNumber } from '@lumimax/config';
import { generateId } from '@lumimax/runtime';
import { DeviceTelemetryService } from './device-telemetry.service';

@Injectable()
export class DevicePresenceMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DevicePresenceMonitorService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @Inject(DeviceTelemetryService)
    private readonly deviceTelemetryService: DeviceTelemetryService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.getScanIntervalMs();
    this.timer = setInterval(() => {
      void this.scan();
    }, intervalMs);
    this.timer.unref();
    void this.scan();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async scan(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const timeoutMs = this.getOfflineTimeoutMs();
      const marked = await this.deviceTelemetryService.markStaleDevicesOffline({
        timeoutMs,
        requestId: `presence-scan-${generateId()}`,
      });
      if (marked > 0) {
        this.logger.log(`marked ${marked} stale device(s) offline timeoutMs=${timeoutMs}`);
      }
    } catch (error) {
      this.logger.warn(
        `device presence scan failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private getOfflineTimeoutMs(): number {
    const seconds = getEnvNumber('IOT_DEVICE_OFFLINE_TIMEOUT', 120);
    return Math.max(15, seconds) * 1000;
  }

  private getScanIntervalMs(): number {
    const value = getEnvNumber('IOT_DEVICE_OFFLINE_INTERVAL', 30000);
    return Math.max(5000, value);
  }
}
