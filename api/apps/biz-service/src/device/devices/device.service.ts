import { Injectable } from '@nestjs/common';

@Injectable()
export class DeviceService {
  getStatus(): string {
    return 'biz-device-ready';
  }
}
