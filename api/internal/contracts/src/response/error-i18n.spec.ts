import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessCode } from './business-code';
import {
  localizeErrorMessageByCode,
  normalizeLocale,
  resolveLocaleFromRequest,
} from './error-i18n';

test('normalizes locale from language header', () => {
  const locale = resolveLocaleFromRequest({
    headers: {
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  assert.equal(locale, 'zh-CN');
});

test('uses zh-CN as fallback locale', () => {
  assert.equal(normalizeLocale('fr-FR'), 'zh-CN');
});

test('localizes message by business code', () => {
  assert.equal(
    localizeErrorMessageByCode(BusinessCode.USER_NOAUTH, 'zh-CN'),
    '未授权，请先登录',
  );
  assert.equal(
    localizeErrorMessageByCode(BusinessCode.USER_NOAUTH, 'en-US'),
    'Unauthorized, please sign in first',
  );
  assert.equal(
    localizeErrorMessageByCode(BusinessCode.USER_NOT_REGISTERED, 'zh-CN'),
    '用户未注册',
  );
  assert.equal(
    localizeErrorMessageByCode(BusinessCode.USER_NOAUTH, 'ko-KR'),
    '인증되지 않았습니다. 먼저 로그인하세요',
  );
});
