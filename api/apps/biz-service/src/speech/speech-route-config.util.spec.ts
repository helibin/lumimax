import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSpeechRoutesYaml,
  toSpeechRouteMarket,
} from './speech-route-config.util';

test('parseSpeechRoutesYaml reads cn/us provider order', () => {
  const config = parseSpeechRoutesYaml(`
version: v1
routes:
  cn:
    default:
      - tencent
      - aliyun
  us:
    default:
      - openai
      - deepgram
`);
  assert.ok(config);
  assert.deepEqual(config.routes.cn.default, ['tencent', 'aliyun']);
  assert.deepEqual(config.routes.us.default, ['openai', 'deepgram']);
});

test('toSpeechRouteMarket maps diet markets', () => {
  assert.equal(toSpeechRouteMarket('CN'), 'cn');
  assert.equal(toSpeechRouteMarket('US'), 'us');
  assert.equal(toSpeechRouteMarket(undefined), 'global');
});
