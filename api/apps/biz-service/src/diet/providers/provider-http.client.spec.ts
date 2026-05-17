import assert from 'node:assert/strict';
import test from 'node:test';
import { DietProviderHttpClient } from './provider-http.client';
import { ExternalServiceError } from './provider-error';

test('postJson redacts api key and exposes fetch cause', async () => {
  const client = new DietProviderHttpClient({ debug() {} } as never);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const error = new Error('fetch failed');
    (error as Error & { cause?: Error }).cause = Object.assign(
      new Error('getaddrinfo ENOTFOUND generativelanguage.googleapis.com'),
      { code: 'ENOTFOUND' },
    );
    throw error;
  }) as typeof fetch;

  try {
    await assert.rejects(
      client.postJson({
        url: 'https://generativelanguage.googleapis.com/v1beta/models/demo:generateContent?key=secret123',
        body: {},
        timeoutMs: 1500,
      }),
      (error: unknown) => {
        assert.match(String(error), /POST https:\/\/generativelanguage\.googleapis\.com\/.*key=%5BREDACTED%5D 请求失败: fetch failed/);
        assert.match(String(error), /原因=ENOTFOUND: getaddrinfo ENOTFOUND generativelanguage\.googleapis\.com/);
        assert.doesNotMatch(String(error), /secret123/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getBinary timeout message is explicit', async () => {
  const client = new DietProviderHttpClient({ debug() {} } as never);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    await new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const abortError = new Error('This operation was aborted');
        abortError.name = 'AbortError';
        reject(abortError);
      });
    });
    throw new Error('unreachable');
  }) as typeof fetch;

  try {
    await assert.rejects(
      client.getBinary({
        url: 'https://example.com/demo.jpg',
        timeoutMs: 10,
      }),
      (error: unknown) => {
        assert.ok(error instanceof ExternalServiceError);
        assert.equal(error.kind, 'timeout');
        assert.equal(error.userMessage, '第三方服务请求超时');
        assert.match(String(error), /GET https:\/\/example\.com\/demo\.jpg 请求超时，超时时间 10ms/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getBinary translates object storage missing-key message to chinese', async () => {
  const client = new DietProviderHttpClient({ debug() {} } as never);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('The specified key does not exist.', {
      status: 404,
      headers: { 'content-type': 'text/plain' },
    })) as typeof fetch;

  try {
    await assert.rejects(
      client.getBinary({
        url: 'https://bucket.example.com/demo.jpg',
        timeoutMs: 100,
      }),
      (error: unknown) => {
        assert.ok(error instanceof ExternalServiceError);
        assert.equal(error.kind, 'not_found');
        assert.equal(error.userMessage, '第三方资源不存在');
        assert.match(String(error), /HTTP 404: 指定的对象不存在/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('postJson classifies rate limit response', async () => {
  const client = new DietProviderHttpClient({ debug() {} } as never);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('too many requests', {
      status: 429,
      headers: { 'content-type': 'text/plain' },
    })) as typeof fetch;

  try {
    await assert.rejects(
      client.postJson({
        url: 'https://api.example.com/v1/demo',
        body: {},
        timeoutMs: 100,
      }),
      (error: unknown) => {
        assert.ok(error instanceof ExternalServiceError);
        assert.equal(error.kind, 'rate_limit');
        assert.equal(error.userMessage, '第三方服务限流');
        assert.equal(error.retryable, true);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('postJson retries once on retryable 503 response', async () => {
  const client = new DietProviderHttpClient({ debug() {} } as never);
  const originalFetch = globalThis.fetch;
  const originalMaxAttempts = process.env.THIRD_PARTY_HTTP_MAX_ATTEMPTS;
  const originalRetryDelayMs = process.env.THIRD_PARTY_HTTP_RETRY_DELAY_MS;
  let callCount = 0;
  process.env.THIRD_PARTY_HTTP_MAX_ATTEMPTS = '2';
  process.env.THIRD_PARTY_HTTP_RETRY_DELAY_MS = '0';
  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response('{"code":50508,"message":"System is too busy now. Please try again later.","data":null}', {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{"items":[{"name":"rice"}]}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await client.postJson<{ items: Array<{ name: string }> }>({
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      body: {
        model: 'Qwen/Qwen3-VL-8B-Instruct',
      },
      timeoutMs: 100,
      requestId: 'req_retryable_503',
    });
    assert.equal(callCount, 2);
    assert.deepEqual(result, {
      items: [{ name: 'rice' }],
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalMaxAttempts === undefined) {
      delete process.env.THIRD_PARTY_HTTP_MAX_ATTEMPTS;
    } else {
      process.env.THIRD_PARTY_HTTP_MAX_ATTEMPTS = originalMaxAttempts;
    }
    if (originalRetryDelayMs === undefined) {
      delete process.env.THIRD_PARTY_HTTP_RETRY_DELAY_MS;
    } else {
      process.env.THIRD_PARTY_HTTP_RETRY_DELAY_MS = originalRetryDelayMs;
    }
  }
});

test('getJson redacts edamam app credentials and translates api mismatch message', async () => {
  const client = new DietProviderHttpClient({ debug() {} } as never);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('{"status":"error","message":"This app_id is for another API."}', {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  try {
    await assert.rejects(
      client.getJson({
        url: 'https://api.edamam.com/api/nutrition-data?app_id=demo-app-id&app_key=demo-app-key&nutrition-type=logging&ingr=100+g+Avocado',
        timeoutMs: 100,
      }),
      (error: unknown) => {
        assert.ok(error instanceof ExternalServiceError);
        assert.equal(error.kind, 'unauthorized');
        assert.equal(error.userMessage, '第三方服务鉴权失败');
        assert.match(String(error), /app_id=%5BREDACTED%5D/);
        assert.match(String(error), /app_key=%5BREDACTED%5D/);
        assert.match(String(error), /当前 app_id 不属于 Nutrition Data API，请检查 Edamam 应用类型/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getJson failure log includes status summary in message', async () => {
  const errorLogs: Array<{ message: string; payload: Record<string, unknown> }> = [];
  const client = new DietProviderHttpClient({
    debug() {},
    error(message: string, payload: Record<string, unknown>) {
      errorLogs.push({ message, payload });
    },
  } as never);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('{"error":"not found"}', {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  try {
    await assert.rejects(
      client.getJson({
        url: 'https://api.nal.usda.gov/fdc/v1/food/2715733?api_key=demo-usda-key',
        requestId: 'req_usda_404',
        timeoutMs: 100,
      }),
      ExternalServiceError,
    );
    assert.equal(errorLogs.length, 1);
    assert.equal(
      errorLogs[0]?.message,
      '第三方调用失败 GET https://api.nal.usda.gov/fdc/v1/food/2715733?api_key=%5BREDACTED%5D kind=not_found status=404 retryable=false',
    );
    assert.deepEqual(errorLogs[0]?.payload?.result, {
      kind: 'not_found',
      statusCode: 404,
      retryable: false,
      userMessage: '第三方资源不存在',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('postJson logs request params, response event and business result summary', async () => {
  const debugLogs: Array<{ message: string; payload: Record<string, unknown> }> = [];
  const client = new DietProviderHttpClient({
    debug(message: string, payload: Record<string, unknown>) {
      debugLogs.push({ message, payload });
    },
  } as never);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('{"items":[{"name":"rice"}],"usage":{"total_tokens":123}}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_demo_123',
      },
    })) as typeof fetch;

  try {
    const result = await client.postJson<Record<string, unknown>>({
      url: 'https://api.example.com/v1/demo?api_key=secret123&query=rice',
      requestId: 'req_third_party_1',
      headers: {
        Authorization: 'Bearer secret-token',
      },
      body: {
        query: '100g rice',
        imageBase64: 'abcd1234',
      },
      timeoutMs: 100,
    });

    assert.deepEqual(result, {
      items: [{ name: 'rice' }],
      usage: { total_tokens: 123 },
    });
    assert.equal(debugLogs.length, 2);
    assert.equal(debugLogs[0]?.message, '发起第三方调用 POST https://api.example.com/v1/demo?api_key=%5BREDACTED%5D&query=rice');
    assert.equal(debugLogs[0]?.payload?.requestId, 'req_third_party_1');
    assert.equal(debugLogs[0]?.payload?.idLabel, 'ReqId');
    assert.deepEqual(debugLogs[0]?.payload?.request, {
      target: {
        host: 'api.example.com',
        pathname: '/v1/demo',
      },
      params: {
        api_key: '[REDACTED]',
        query: 'rice',
      },
      headers: {
        Authorization: '[REDACTED]',
      },
      body: {
        query: '100g rice',
        imageBase64: '[REDACTED:8]',
      },
    });
    assert.equal(debugLogs[1]?.message, '<<< 第三方调用完成 POST 200');
    assert.equal(debugLogs[1]?.payload?.requestId, 'req_third_party_1');
    assert.equal(debugLogs[1]?.payload?.idLabel, 'ReqId');
    assert.equal(typeof (debugLogs[1]?.payload?.responseEvent as Record<string, unknown>)?.durationMs, 'number');
    assert.deepEqual(debugLogs[1]?.payload?.responseEvent, {
      attempt: 1,
      maxAttempts: 2,
      statusCode: 200,
      ok: true,
      durationMs: (debugLogs[1]?.payload?.responseEvent as Record<string, unknown>)?.durationMs,
      finishedAt: (debugLogs[1]?.payload?.responseEvent as Record<string, unknown>)?.finishedAt,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_demo_123',
      },
    });
    assert.deepEqual(debugLogs[1]?.payload?.result, {
      items: [{ name: 'rice' }],
      usage: {
        total_tokens: 123,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('postJson summarizes llm chat completion result into output', async () => {
  const debugLogs: Array<{ message: string; payload: Record<string, unknown> }> = [];
  const client = new DietProviderHttpClient({
    debug(message: string, payload: Record<string, unknown>) {
      debugLogs.push({ message, payload });
    },
  } as never);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      '{"id":"chatcmpl_demo","object":"chat.completion","created":1779014767,"model":"gpt-4.1-mini","choices":[{"finish_reason":"stop","message":{"content":"{\\"imageType\\":\\"food_photo\\",\\"items\\":[{\\"name\\":\\"rice\\",\\"confidence\\":0.98}]}"}}],"usage":{"total_tokens":123},"system_fingerprint":"fp_demo"}',
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      },
    )) as typeof fetch;

  try {
    await client.postJson<Record<string, unknown>>({
      url: 'https://api.example.com/v1/chat/completions',
      requestId: 'req_chat_completion_1',
      body: {
        model: 'gpt-4.1-mini',
      },
      timeoutMs: 100,
    });

    assert.equal(debugLogs[1]?.message, '<<< 第三方调用完成 POST 200');
    assert.deepEqual(debugLogs[1]?.payload?.result, {
      choices: 1,
      finishReason: 'stop',
      output: {
        imageType: 'food_photo',
        items: [{ name: 'rice', confidence: 0.98 }],
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
