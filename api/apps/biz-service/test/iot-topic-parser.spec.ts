import assert from 'node:assert/strict';
import test from 'node:test';
import { BizIotTopicKind } from '../src/iot/iot.types';
import { TopicParserService } from '../src/iot/pipeline/topic-parser.service';

test('topic parser extracts version category deviceId and direction', () => {
  const service = new TopicParserService();
  const parsed = service.parse('v1/event/01HABCDEFGHJKMNPQRSTVWXYZ0/req');
  assert.deepEqual(parsed, {
    version: 'v1',
    category: 'event',
    deviceId: '01habcdefghjkmnpqrstvwxyz0',
    direction: 'req',
    kind: BizIotTopicKind.EVENT_REQ,
  });
});

test('topic parser builds response topic from kind', () => {
  const service = new TopicParserService();
  assert.equal(
    service.build(BizIotTopicKind.EVENT_RES, '01HABCDEFGHJKMNPQRSTVWXYZ0'),
    'v1/event/01habcdefghjkmnpqrstvwxyz0/res',
  );
});
