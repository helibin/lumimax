import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import type { SpeechRouteConfig, SpeechRouteMarket } from './speech-recognition.types';
import { DEFAULT_SPEECH_ROUTE_CONFIG, parseSpeechRoutesYaml } from './speech-route-config.util';

function loadSpeechRouteConfig(): SpeechRouteConfig {
  const configuredPath = getEnvString(
    'SPEECH_ROUTE_CONFIG_PATH',
    join(__dirname, 'config', 'speech-provider-routes.yaml'),
  )!
    .trim();
  const absolutePath = resolve(configuredPath);
  if (!existsSync(absolutePath)) {
    return DEFAULT_SPEECH_ROUTE_CONFIG;
  }
  const parsed = parseSpeechRoutesYaml(readFileSync(absolutePath, 'utf8'));
  return parsed ?? DEFAULT_SPEECH_ROUTE_CONFIG;
}

@Injectable()
export class SpeechRouteConfigService {
  private cached?: SpeechRouteConfig;

  getConfig(): SpeechRouteConfig {
    if (!this.cached) {
      this.cached = loadSpeechRouteConfig();
    }
    return this.cached;
  }

  resolveProviderCodes(input: {
    market: SpeechRouteMarket;
    routeKey?: string;
  }): string[] {
    const config = this.getConfig();
    const marketRoutes = config.routes[input.market] ?? config.routes.global;
    const routeKey = input.routeKey?.trim() || 'default';
    return [...(marketRoutes[routeKey] ?? marketRoutes.default ?? [])];
  }
}
