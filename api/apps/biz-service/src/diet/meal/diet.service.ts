import { Injectable } from '@nestjs/common';

@Injectable()
export class DietService {
  getStatus(): string {
    return 'biz-diet-ready';
  }
}
