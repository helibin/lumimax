import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import type { FoodQueryMarket, ProviderRouteConfig } from './food-query.types';
import {
  DEFAULT_ROUTE_CONFIG,
  parseProviderRoutesYaml,
  resolveRouteKey,
} from './provider-route-config.util';

export { parseProviderRoutesYaml, resolveRouteKey } from './provider-route-config.util';

function loadProviderRouteConfig(): ProviderRouteConfig {
  const configuredPath = getEnvString(
    'PROVIDER_ROUTE_CONFIG_PATH',
    join(__dirname, 'config', 'provider-routes.yaml'),
  )!
    .trim();
  const absolutePath = resolve(configuredPath);
  if (!existsSync(absolutePath)) {
    return DEFAULT_ROUTE_CONFIG;
  }
  const parsed = parseProviderRoutesYaml(readFileSync(absolutePath, 'utf8'));
  return parsed ?? DEFAULT_ROUTE_CONFIG;
}

@Injectable()
export class ProviderRouteConfigService {
  private cached?: ProviderRouteConfig;

  getConfig(): ProviderRouteConfig {
    if (!this.cached) {
      this.cached = loadProviderRouteConfig();
    }
    return this.cached;
  }

  resolveProviderCodes(input: {
    market: FoodQueryMarket;
    routeKey: string;
  }): string[] {
    const config = this.getConfig();
    const marketRoutes = config.routes[input.market] ?? config.routes.global;
    const routeKey = input.routeKey.trim() || 'default';
    return [...(marketRoutes[routeKey] ?? marketRoutes.default ?? [])];
  }
}
