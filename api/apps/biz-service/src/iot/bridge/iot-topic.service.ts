import { Inject, Injectable } from '@nestjs/common';
import { TopicParserService } from '../events/topic-parser.service';

@Injectable()
export class IotTopicService {
  constructor(
    @Inject(TopicParserService) private readonly topicParserService: TopicParserService,
  ) {}

  parse(topic: string) {
    const parsed = this.topicParserService.parse(topic);
    return {
      version: parsed.version,
      channel: parsed.category,
      deviceId: parsed.deviceId,
      direction: parsed.direction,
      kind: parsed.kind,
    };
  }
}
