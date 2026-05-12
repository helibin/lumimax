/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-23 15:09:01
 * @LastEditTime: 2026-04-27 16:55:58
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/apps/gateway/src/controllers/controller-context.util.ts
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '@lumimax/auth';
import { getDefaultTenantId } from '@lumimax/config';

export function requireUser(req: any): AuthenticatedUser {
  const user = req?.user as AuthenticatedUser | undefined;
  if (!user?.userId) {
    throw new UnauthorizedException('Missing user context');
  }
  return user;
}

export function ensureAdminPrincipal(user: AuthenticatedUser, routePath: string): void {
  if (user.type !== 1) {
    throw new ForbiddenException(`Admin route requires B user: ${routePath}`);
  }
}

export function resolveTenantScope(req: any, user?: AuthenticatedUser): string | null {
  const requestedTenantId = pickString(
    req?.headers?.['x-tenant-id'],
    req?.headers?.['tenant-id'],
    req?.query?.tenantId,
    req?.query?.tenant_id,
    req?.params?.tenantId,
    req?.params?.tenant_id,
    req?.body?.tenantId,
    req?.body?.tenant_id,
  );
  if (!user) {
    return requestedTenantId ?? getDefaultTenantId();
  }
  if (canSwitchTenantScope(user)) {
    return requestedTenantId ?? getDefaultTenantId();
  }
  return user.tenantId ?? getDefaultTenantId();
}

function canSwitchTenantScope(user: AuthenticatedUser): boolean {
  if (user.type !== 1) {
    return false;
  }
  if (user.permissions?.includes('*')) {
    return true;
  }
  return (user.roles ?? []).some((role) => role === 'admin' || role === 'super');
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      const candidate = pickString(...value);
      if (candidate) {
        return candidate;
      }
      continue;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}
