import { Injectable } from '@nestjs/common';
import type { AdminSystemServiceName } from '../system/system-admin-router.service';

@Injectable()
export class DictionaryService {
  getStatus(): string {
    return 'base-dictionary-ready';
  }

  ownsAdmin(service: AdminSystemServiceName): boolean {
    return service === 'dictionaries';
  }
}
