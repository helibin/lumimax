import type {
  CanActivate,
  ExecutionContext} from '@nestjs/common';
import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from './auth.types';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { POLICIES_KEY } from './policies.decorator';

void Reflector;

interface PolicyGuardRequest {
  user?: AuthenticatedUser;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: Record<string, unknown> | unknown;
  tenantScope?: string | null;
}

@Injectable()
export class PolicyGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector: Reflector) {
    this.reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const requiredPolicies =
      this.reflector.getAllAndOverride<string[]>(POLICIES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const request = context.switchToHttp().getRequest<PolicyGuardRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Missing authenticated principal');
    }

    this.assertTenantScope(request, user);
    this.assertPermissions(user, requiredPermissions);
    this.assertPolicies(user, requiredPolicies);
    return true;
  }

  private assertPermissions(user: AuthenticatedUser, required: string[]): void {
    if (required.length === 0) {
      return;
    }
    const granted = new Set(user.permissions ?? []);
    const allowed = required.every((permission) => granted.has(permission));
    if (!allowed) {
      throw new ForbiddenException('Missing required permissions');
    }
  }

  private assertPolicies(user: AuthenticatedUser, required: string[]): void {
    if (required.length === 0) {
      return;
    }
    const granted = new Set(user.policies ?? []);
    const allowed = required.every((policy) => granted.has(policy));
    if (!allowed) {
      throw new ForbiddenException('Missing required policies');
    }
  }

  private assertTenantScope(
    request: PolicyGuardRequest,
    user: AuthenticatedUser,
  ): void {
    const requestedTenantId = this.resolveTenantIdFromRequest(request);
    const userTenantId = user.tenantId ?? null;
    if (!userTenantId) {
      request.tenantScope = requestedTenantId ?? null;
      return;
    }

    if (requestedTenantId && requestedTenantId !== userTenantId) {
      throw new ForbiddenException('tenant scope mismatch');
    }
    request.tenantScope = userTenantId;
  }

  private resolveTenantIdFromRequest(request: PolicyGuardRequest): string | null {
    const fromHeaders = this.pickString(
      request.headers?.['x-tenant-id'],
      request.headers?.['tenant-id'],
    );
    const query = this.toRecord(request.query);
    const params = this.toRecord(request.params);
    const body = this.toRecord(request.body);

    return this.pickString(
      fromHeaders,
      query.tenantId,
      query.tenant_id,
      params.tenantId,
      params.tenant_id,
      body.tenantId,
      body.tenant_id,
    );
  }

  private toRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }
    return input as Record<string, unknown>;
  }

  private pickString(...values: unknown[]): string | null {
    for (const value of values) {
      if (Array.isArray(value)) {
        const fromArray = this.pickString(...value);
        if (fromArray) {
          return fromArray;
        }
        continue;
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }
}
