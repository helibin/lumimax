import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createErrorResponse,
  createPagedResponse,
  createSuccessResponse,
  extractPagedResult,
} from './response.factory';

test('createSuccessResponse includes status', () => {
  const response = createSuccessResponse({ ok: true }, '01h0000000000000000000101', 'ok', 201);
  assert.equal(response.status, 201);
  assert.equal(response.code, 0);
  assert.equal(response.requestId, '01h0000000000000000000101');
});

test('createPagedResponse includes status', () => {
  const response = createPagedResponse(
    [{ id: 1 }],
    {
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      hasMore: false,
    },
    '01h0000000000000000000102',
    'ok',
    206,
  );

  assert.equal(response.status, 206);
  assert.equal(response.code, 0);
  assert.equal(response.pagination?.page, 1);
});

test('createErrorResponse supports explicit status', () => {
  const response = createErrorResponse(42901, 'too many', '01h0000000000000000000103', 429, {
    key: 'request.too_many',
  });

  assert.equal(response.status, 429);
  assert.equal(response.code, 42901);
});

test('createErrorResponse keeps backward-compatible options signature', () => {
  const response = createErrorResponse(50000, 'internal error', '01h0000000000000000000104', {
    key: 'system.internal_error',
  });

  assert.equal(response.status, 500);
  assert.equal(response.code, 50000);
});

test('extractPagedResult supports items plus snake_case pagination', () => {
  const result = extractPagedResult({
    items: [{ id: 1 }],
    pagination: {
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
      has_more: false,
    },
  });

  assert.deepEqual(result, {
    data: [{ id: 1 }],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      hasMore: false,
    },
  });
});
