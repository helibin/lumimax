import type { DietMarket } from '../diet/market/diet-market';
import type { SpeechRouteConfig, SpeechRouteMarket } from './speech-recognition.types';

export const DEFAULT_SPEECH_ROUTE_CONFIG: SpeechRouteConfig = {
  version: 'v1',
  routes: {
    cn: {
      default: ['tencent', 'aliyun', 'iflytek', 'baidu', 'funasr'],
    },
    us: {
      default: ['openai', 'deepgram', 'azure', 'google', 'faster_whisper'],
    },
    global: {
      default: ['openai', 'tencent'],
    },
  },
};

export function parseSpeechRoutesYaml(content: string): SpeechRouteConfig | null {
  const routes: SpeechRouteConfig['routes'] = {
    cn: {},
    us: {},
    global: {},
  };
  let version = 'v1';
  let currentMarket: SpeechRouteMarket | null = null;
  let currentRouteKey: string | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('version:')) {
      version = line.split(':')[1]?.trim() ?? version;
      continue;
    }
    const marketMatch = line.match(/^(cn|us|global):\s*$/);
    if (marketMatch) {
      currentMarket = marketMatch[1] as SpeechRouteMarket;
      currentRouteKey = null;
      continue;
    }
    const routeMatch = line.match(/^([a-z0-9_]+):\s*$/);
    if (routeMatch && currentMarket) {
      currentRouteKey = routeMatch[1]!;
      routes[currentMarket][currentRouteKey] = [];
      continue;
    }
    const providerMatch = line.match(/^-\s+([a-z0-9_]+)\s*$/);
    if (providerMatch && currentMarket && currentRouteKey) {
      routes[currentMarket][currentRouteKey]!.push(providerMatch[1]!);
    }
  }

  if (!routes.cn.default?.length && !routes.us.default?.length) {
    return null;
  }
  return { version, routes };
}

export function toSpeechRouteMarket(market?: string): SpeechRouteMarket {
  const normalized = market?.trim().toUpperCase();
  if (normalized === 'CN') {
    return 'cn';
  }
  if (normalized === 'US') {
    return 'us';
  }
  return 'global';
}

export function dietMarketToSpeechRoute(market: DietMarket): SpeechRouteMarket {
  return market === 'CN' ? 'cn' : 'us';
}
