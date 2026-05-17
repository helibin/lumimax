import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisionIdentifyUserPrompt, VISION_IDENTIFY_SYSTEM_PROMPT } from './vision-llm-prompt.util';

test('vision identify prompt enforces shared schema and rules for all providers', () => {
  assert.match(VISION_IDENTIFY_SYSTEM_PROMPT, /Return JSON only/);
  assert.match(VISION_IDENTIFY_SYSTEM_PROMPT, /estimatedWeightGram/);
  assert.match(VISION_IDENTIFY_SYSTEM_PROMPT, /children/);
  assert.match(VISION_IDENTIFY_SYSTEM_PROMPT, /packaged_food_front/);
});

test('vision identify user prompt carries locale and country context', () => {
  const prompt = buildVisionIdentifyUserPrompt({
    locale: 'zh-CN',
    countryCode: 'CN',
    requestId: 'req_prompt',
  });

  assert.match(prompt, /locale=zh-CN/);
  assert.match(prompt, /country=CN/);
  assert.match(prompt, /Return JSON only/);
});

test('vision identify user prompt preserves explicit override', () => {
  const prompt = buildVisionIdentifyUserPrompt({
    prompt: 'Custom prompt',
    requestId: 'req_override',
  });

  assert.equal(prompt, 'Custom prompt');
});
