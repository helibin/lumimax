import { Injectable } from '@nestjs/common';

@Injectable()
export class UserService {
  getStatus(): string {
    return 'base-user-ready';
  }
}
