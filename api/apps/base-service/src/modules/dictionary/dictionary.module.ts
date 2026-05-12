import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PersistenceModule } from '../../persistence/persistence.module';
import { DictionaryApplicationService } from './dictionary-application.service';
import { DictionaryService } from './dictionary.service';

@Module({
  imports: [PersistenceModule, AuditLogModule],
  providers: [DictionaryService, DictionaryApplicationService],
  exports: [DictionaryService, DictionaryApplicationService],
})
export class DictionaryModule {}
