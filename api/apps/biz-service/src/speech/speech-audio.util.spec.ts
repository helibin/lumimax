import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isLikelyTranscribedText,
  looksLikeAudioPayload,
} from './speech-audio.util';

test('treats natural language as already transcribed', () => {
  assert.equal(isLikelyTranscribedText('早餐吃了两个鸡蛋'), true);
  assert.equal(isLikelyTranscribedText('two eggs for breakfast'), true);
});

test('treats urls and audio keys as audio payloads', () => {
  assert.equal(isLikelyTranscribedText('https://cdn.example.com/voice/a.m4a'), false);
  assert.equal(isLikelyTranscribedText('tenant/u1/audio/meal-voice.m4a'), false);
});

test('detects audio payload inputs', () => {
  assert.equal(
    looksLikeAudioPayload({
      target: '早餐吃了两个鸡蛋',
    }),
    false,
  );
  assert.equal(
    looksLikeAudioPayload({
      target: 'diet/voice/sample.m4a',
    }),
    true,
  );
  assert.equal(
    looksLikeAudioPayload({
      audioUrl: 'https://cdn.example.com/a.m4a',
    }),
    true,
  );
});
