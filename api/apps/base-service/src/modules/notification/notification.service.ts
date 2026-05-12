import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationService {
  getStatus(): string {
    return 'base-notification-ready';
  }
}
