import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AllExceptionFilter } from './exception.filter';

test('AllExceptionFilter localizes generic route 404 details without leaking Nest english text', () => {
  const { statusCode, payload } = captureErrorPayload(new NotFoundException('Cannot GET /api/'));

  const body = payload as {
    code: number;
    msg: string;
    error?: {
      details?: Record<string, unknown>;
    };
  };

  assert.equal(statusCode, 404);
  assert.equal(body.code, 40401);
  assert.equal(body.msg, '请求资源不存在');
  assert.deepEqual(body.error?.details, {
    message: '请求资源不存在',
    method: 'GET',
    path: '/api/',
  });
});

test('AllExceptionFilter localizes generic unauthorized details without leaking Nest english text', () => {
  const { statusCode, payload } = captureErrorPayload(new UnauthorizedException());
  const body = payload as {
    code: number;
    msg: string;
    error?: {
      details?: Record<string, unknown>;
    };
  };

  assert.equal(statusCode, 401);
  assert.equal(body.code, 40002);
  assert.equal(body.msg, '登录状态无效或已过期，请重新登录');
  assert.deepEqual(body.error?.details, {
    message: '登录状态无效或已过期，请重新登录',
  });
});

test('AllExceptionFilter localizes generic forbidden details without leaking Nest english text', () => {
  const { statusCode, payload } = captureErrorPayload(new ForbiddenException());
  const body = payload as {
    code: number;
    msg: string;
    error?: {
      details?: Record<string, unknown>;
    };
  };

  assert.equal(statusCode, 403);
  assert.equal(body.code, 40301);
  assert.equal(body.msg, '无权限访问该资源');
  assert.deepEqual(body.error?.details, {
    message: '无权限访问该资源',
  });
});

test('AllExceptionFilter localizes generic bad request details without leaking Nest english text', () => {
  const { statusCode, payload } = captureErrorPayload(new BadRequestException());
  const body = payload as {
    code: number;
    msg: string;
    error?: {
      details?: Record<string, unknown>;
    };
  };

  assert.equal(statusCode, 400);
  assert.equal(body.code, 40003);
  assert.equal(body.msg, '请求参数不合法');
  assert.deepEqual(body.error?.details, {
    message: '请求参数不合法',
  });
});

test('AllExceptionFilter keeps validation details when request has structured validation errors', () => {
  const { payload } = captureErrorPayload(
    new BadRequestException({
      message: 'Validation failed',
      errors: ['name: must be a string'],
    }),
  );
  const body = payload as {
    code: number;
    msg: string;
    error?: {
      details?: Record<string, unknown>;
    };
  };

  assert.equal(body.code, 40004);
  assert.deepEqual(body.error?.details, {
    message: 'Validation failed',
    errors: ['name: must be a string'],
  });
});

function captureErrorPayload(exception: unknown): { statusCode: number; payload: unknown } {
  let statusCode = 0;
  let jsonPayload: unknown;
  const filter = new AllExceptionFilter(
    {
      error() {
        return;
      },
    } as never,
  );

  filter.catch(
    exception,
    {
      getType() {
        return 'http';
      },
      switchToHttp() {
        return {
          getRequest() {
            return {
              method: 'GET',
              url: '/api/',
              headers: {
                'x-locale': 'zh-CN',
              },
            };
          },
          getResponse() {
            return {
              status(code: number) {
                statusCode = code;
                return {
                  json(payload: unknown) {
                    jsonPayload = payload;
                  },
                };
              },
              setHeader() {
                return;
              },
            };
          },
        };
      },
    } as never,
  );

  return { statusCode, payload: jsonPayload };
}
