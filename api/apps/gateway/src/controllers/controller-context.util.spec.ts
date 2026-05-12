import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedUser } from '@lumimax/auth';
import { UserType } from '@lumimax/auth';
import { getDefaultTenantId } from '@lumimax/config';
import { resolveTenantScope } from './controller-context.util';

function buildUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    userId: '01h0000000000000000000001',
    type: UserType.CUSTOMER,
    tenantId: '01h0000000000000000000011',
    roles: [],
    permissions: [],
    policies: [],
    ...overrides,
  };
}

test('resolveTenantScope lets admin switch tenant by request tenantId', () => {
  const tenantScope = resolveTenantScope(
    {
      query: { tenantId: '01h0000000000000000000012' },
    },
    buildUser({
      type: UserType.INTERNAL,
      tenantId: '01h0000000000000000000011',
      roles: ['admin'],
    }),
  );
  assert.equal(tenantScope, '01h0000000000000000000012');
});

test('resolveTenantScope defaults admin to default tenant when request tenantId missing', () => {
  const tenantScope = resolveTenantScope(
    {},
    buildUser({
      type: UserType.INTERNAL,
      tenantId: '01h0000000000000000000011',
      permissions: ['*'],
    }),
  );
  assert.equal(tenantScope, getDefaultTenantId());
});

test('resolveTenantScope keeps non-admin user inside own tenant', () => {
  const tenantScope = resolveTenantScope(
    {
      query: { tenantId: '01h0000000000000000000012' },
    },
    buildUser({}),
  );
  assert.equal(tenantScope, '01h0000000000000000000011');
});
