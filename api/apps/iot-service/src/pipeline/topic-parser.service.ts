import { Injectable } from '@nestjs/common';
import { BizIotTopicKind } from '../iot.types';

const KIND_TO_PARTS: Record<
  BizIotTopicKind,
  { category: 'connect' | 'status' | 'event' | 'attr' | 'cmd'; direction: 'req' | 'res' }
> = {
  [BizIotTopicKind.CONNECT_REQ]: { category: 'connect', direction: 'req' },
  [BizIotTopicKind.CONNECT_RES]: { category: 'connect', direction: 'res' },
  [BizIotTopicKind.STATUS_REQ]: { category: 'status', direction: 'req' },
  [BizIotTopicKind.EVENT_REQ]: { category: 'event', direction: 'req' },
  [BizIotTopicKind.EVENT_RES]: { category: 'event', direction: 'res' },
  [BizIotTopicKind.ATTR_REQ]: { category: 'attr', direction: 'req' },
  [BizIotTopicKind.ATTR_RES]: { category: 'attr', direction: 'res' },
  [BizIotTopicKind.CMD_REQ]: { category: 'cmd', direction: 'req' },
  [BizIotTopicKind.CMD_RES]: { category: 'cmd', direction: 'res' },
};

@Injectable()
export class TopicParserService {
  parse(topic: string): {
    version: 'v1';
    category: 'connect' | 'status' | 'event' | 'attr' | 'cmd';
    deviceId: string;
    direction: 'req' | 'res';
    kind: BizIotTopicKind;
  } {
    const parts = String(topic).split('/');
    if (parts.length !== 4) {
      throw new Error(`非法的 IoT topic: ${topic}`);
    }
    const [version, category, rawDeviceId, direction] = parts;
    if (version !== 'v1') {
      throw new Error(`不支持的 IoT topic 版本: ${version}`);
    }
    const deviceId = rawDeviceId.trim().toLowerCase();
    if (!deviceId) {
      throw new Error('IoT topic 的 deviceId 不能为空');
    }
    const kind = Object.entries(KIND_TO_PARTS).find(
      ([, value]) => value.category === category && value.direction === direction,
    )?.[0] as BizIotTopicKind | undefined;
    if (!kind) {
      throw new Error(`不支持的 IoT topic 类型: ${topic}`);
    }
    return {
      version: 'v1',
      category: category as 'connect' | 'status' | 'event' | 'attr' | 'cmd',
      deviceId,
      direction: direction as 'req' | 'res',
      kind,
    };
  }

  build(kind: BizIotTopicKind, deviceId: string): string {
    const parts = KIND_TO_PARTS[kind];
    if (!parts) {
      throw new Error(`不支持的 IoT topic 类型: ${kind}`);
    }
    const normalizedDeviceId = deviceId.trim().toLowerCase();
    if (!normalizedDeviceId) {
      throw new Error('IoT topic 的 deviceId 不能为空');
    }
    return `v1/${parts.category}/${normalizedDeviceId}/${parts.direction}`;
  }
}
