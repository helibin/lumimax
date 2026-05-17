import { getDefaultTenantId } from '@lumimax/config';

export function resolveTenantId(tenantScope?: string | null): string {
  if (typeof tenantScope === 'string' && tenantScope.trim().length > 0) {
    return tenantScope.trim();
  }
  return getDefaultTenantId();
}

export function resolveEntityTenantId(
  entityTenantId?: string | null,
  tenantScope?: string | null,
): string {
  if (typeof entityTenantId === 'string' && entityTenantId.trim().length > 0) {
    return entityTenantId.trim();
  }
  return resolveTenantId(tenantScope);
}
