import { Inject, Injectable } from '@nestjs/common';
import type { SpeechRecognitionContext } from './speech-recognition.types';
import { SpeechProviderRegistry } from './speech-provider-registry';
import { SpeechRouteConfigService } from './speech-route-config.service';

@Injectable()
export class SpeechRecognitionRouterService {
  constructor(
    @Inject(SpeechRouteConfigService)
    private readonly routeConfigService: SpeechRouteConfigService,
    @Inject(SpeechProviderRegistry)
    private readonly providerRegistry: SpeechProviderRegistry,
  ) {}

  resolveExecutionChain(context: SpeechRecognitionContext): string[] {
    const configured = this.routeConfigService.resolveProviderCodes({
      market: context.market,
      routeKey: 'default',
    });
    return configured.filter((code) => this.providerRegistry.isEnabled(code));
  }
}
