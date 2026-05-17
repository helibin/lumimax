import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNutritionEstimatorUserPrompt,
  NUTRITION_ESTIMATOR_SYSTEM_PROMPT,
  parseLlmJsonObject,
  readLlmNumber,
  readLlmString,
} from './nutrition-estimator-llm-prompt.util';

test('nutrition estimator prompt enforces shared JSON contract', () => {
  assert.match(NUTRITION_ESTIMATOR_SYSTEM_PROMPT, /Return JSON only/);
  assert.match(NUTRITION_ESTIMATOR_SYSTEM_PROMPT, /confidence/);
  assert.match(NUTRITION_ESTIMATOR_SYSTEM_PROMPT, /provided serving weight/);
});

test('nutrition estimator user prompt carries shared context', () => {
  const prompt = buildNutritionEstimatorUserPrompt({
    foodName: 'salmon',
    weightGram: 135,
    locale: 'en-US',
    countryCode: 'US',
    requestId: 'req_nutrition_prompt',
  });

  assert.match(prompt, /food=salmon/);
  assert.match(prompt, /weightGram=135/);
  assert.match(prompt, /locale=en-US/);
  assert.match(prompt, /country=US/);
});

test('nutrition estimator helpers normalize parsed JSON values', () => {
  const parsed = parseLlmJsonObject('{"name":" yogurt ","calories":123,"protein":9}');

  assert.equal(readLlmString(parsed.name), 'yogurt');
  assert.equal(readLlmNumber(parsed.calories), 123);
  assert.equal(readLlmNumber(parsed.protein), 9);
  assert.equal(readLlmNumber(parsed.fat), 0);
});
