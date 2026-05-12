#!/usr/bin/env node

const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4000');
const adminUsername = process.env.SMOKE_ADMIN_USERNAME?.trim() ?? 'admin';
const adminPasswordMd5 =
  process.env.SMOKE_ADMIN_PASSWORD_MD5?.trim().toLowerCase()
  ?? 'e10adc3949ba59abbe56e057f20f883e';

const checks = [];
let accessToken = '';

try {
  await runPublicChecks();

  if (adminUsername && adminPasswordMd5) {
    accessToken = await loginAdmin();
    await runAdminChecks(accessToken);
  }

  printSummary();
  if (checks.some((item) => item.status === 'failed')) {
    process.exitCode = 1;
  }
} catch (error) {
  fail('fatal', formatError(error));
  printSummary();
  process.exitCode = 1;
}

async function runPublicChecks() {
  await checkJson('gateway.health', '/health', { expectStatus: 200 });
  await checkJson('gateway.system.services', '/api/system/services', { expectStatus: 200 });
  await checkJson('gateway.docs.services', '/docs/services', { expectStatus: 200 });
}

async function runAdminChecks(token) {
  await checkJson('admin.auth.me', '/api/admin/auth/me', {
    expectStatus: 200,
    token,
  });
  await checkJson('admin.system.roles', '/api/admin/system/roles?page=1&pageSize=5', {
    expectStatus: 200,
    token,
  });
  await checkJson('admin.system.admin-users', '/api/admin/system/admin-users?page=1&pageSize=5', {
    expectStatus: 200,
    token,
  });
  await checkJson('admin.devices', '/api/admin/devices?page=1&pageSize=5', {
    expectStatus: 200,
    token,
  });
  await checkJson('admin.notifications', '/api/admin/notifications?page=1&pageSize=5', {
    expectStatus: 200,
    token,
  });
  await checkJson('admin.templates', '/api/admin/templates', {
    expectStatus: 200,
    token,
  });
  await checkJson('admin.device-tokens', '/api/admin/device-tokens', {
    expectStatus: 200,
    token,
  });
}

async function loginAdmin() {
  if (!/^[a-f0-9]{32}$/.test(adminPasswordMd5)) {
    throw new Error('SMOKE_ADMIN_PASSWORD_MD5 must be a 32-character md5 hex string');
  }

  const response = await fetchJson('/api/admin/auth/login', {
    method: 'POST',
    body: {
      username: adminUsername,
      password: adminPasswordMd5,
    },
  });

  if (response.status !== 200) {
    throw new Error(`admin login failed with status ${response.status}`);
  }

  const token = response.data?.accessToken;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('admin login response missing accessToken');
  }

  pass('admin.auth.login', `user=${adminUsername}`);
  return token;
}

async function checkJson(name, path, options = {}) {
  const response = await fetchJson(path, options);
  const expectStatus = options.expectStatus ?? 200;

  if (response.status !== expectStatus) {
    fail(name, `unexpected status ${response.status}`);
    return;
  }

  if (response.json && typeof response.json === 'object' && 'code' in response.json) {
    if (response.json.code !== 0) {
      fail(name, `business code ${String(response.json.code)}: ${response.json.msg ?? ''}`.trim());
      return;
    }
  }

  pass(name, summarizePayload(response.data));
}

async function fetchJson(path, options = {}) {
  const headers = {
    'content-type': 'application/json',
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
  };

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  const data =
    json && typeof json === 'object' && 'data' in json
      ? json.data
      : json;

  return {
    data,
    json,
    status: response.status,
    text,
  };
}

function summarizePayload(payload) {
  if (payload == null) {
    return 'ok';
  }
  if (Array.isArray(payload)) {
    return `array(${payload.length})`;
  }
  if (typeof payload === 'object') {
    if (Array.isArray(payload.items)) {
      return `items=${payload.items.length}, total=${payload.total ?? payload.items.length}`;
    }
    if (Array.isArray(payload.services)) {
      return `services=${payload.services.length}`;
    }
    return `keys=${Object.keys(payload).slice(0, 5).join(',')}`;
  }
  return String(payload);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/$/, '');
}

function pass(name, detail) {
  checks.push({ detail, name, status: 'passed' });
  console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail) {
  checks.push({ detail, name, status: 'failed' });
  console.error(`[FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
}

function note(message) {
  console.log(`[INFO] ${message}`);
}

function printSummary() {
  const passed = checks.filter((item) => item.status === 'passed').length;
  const failed = checks.filter((item) => item.status === 'failed').length;
  console.log(`\nSummary: passed=${passed}, failed=${failed}, baseUrl=${baseUrl}`);
}

function formatError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause;
  if (cause && typeof cause === 'object') {
    const code = typeof cause.code === 'string' ? cause.code : '';
    const message =
      typeof cause.message === 'string' && cause.message.trim().length > 0
        ? cause.message.trim()
        : '';
    if (code || message) {
      return `${error.message}${code || message ? ` (${[code, message].filter(Boolean).join(': ')})` : ''}`;
    }
  }
  return error.message;
}
