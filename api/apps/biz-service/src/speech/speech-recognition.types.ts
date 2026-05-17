import type { DietMarket } from '../diet/market/diet-market';

export type SpeechRouteMarket = 'cn' | 'us' | 'global';

export interface SpeechRouteConfig {
  version: string;
  routes: Record<SpeechRouteMarket, Record<string, string[]>>;
}

export interface SpeechRecognitionContext {
  market: SpeechRouteMarket;
  locale?: string;
  requestId: string;
}
