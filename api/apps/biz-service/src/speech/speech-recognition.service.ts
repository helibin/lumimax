import { Inject, Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import type {
  TranscribeSpeechInput,
  TranscribeSpeechResult,
} from './interfaces/speech-recognition.contracts';
import { toSpeechRouteMarket } from './speech-route-config.util';
import { SpeechRecognitionRouterService } from './speech-recognition-router.service';
import { SpeechProviderRegistry } from './speech-provider-registry';

@Injectable()
export class SpeechRecognitionService {
  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(SpeechRecognitionRouterService)
    private readonly router: SpeechRecognitionRouterService,
    @Inject(SpeechProviderRegistry)
    private readonly registry: SpeechProviderRegistry,
  ) {}

  isEnabled(): boolean {
    return isSpeechRecognitionEnabled() && this.registry.listStatuses().some((item) => item.enabled);
  }

  async transcribe(input: TranscribeSpeechInput): Promise<TranscribeSpeechResult> {
    if (!isSpeechRecognitionEnabled()) {
      throw new Error('语音识别未启用，请配置 SPEECH_RECOGNITION_ENABLED=true');
    }

    const market = toSpeechRouteMarket(input.market);
    const providerCodes = this.router.resolveExecutionChain({
      market,
      locale: input.locale,
      requestId: input.requestId,
    });

    if (providerCodes.length === 0) {
      throw new Error(`当前市场 ${market} 无可用语音识别 Provider，请检查密钥配置`);
    }

    const errors: string[] = [];
    for (const code of providerCodes) {
      const provider = this.registry.get(code);
      if (!provider?.isEnabled()) {
        continue;
      }

      const startedAt = Date.now();
      try {
        const result = await provider.transcribe(input);
        this.logger.log(
          '语音转写完成',
          {
            requestId: input.requestId,
            idLabel: 'ReqId',
            providerCode: result.providerCode,
            durationMs: Date.now() - startedAt,
            textLength: result.text.length,
          },
          SpeechRecognitionService.name,
        );
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${code}: ${message}`);
        this.logger.warn(
          '语音 Provider 转写失败，尝试下一个',
          {
            requestId: input.requestId,
            idLabel: 'ReqId',
            providerCode: code,
            error: message,
          },
          SpeechRecognitionService.name,
        );
      }
    }

    throw new Error(
      errors.length > 0
        ? `语音识别全部失败: ${errors.join('; ')}`
        : `语音识别全部失败: market=${market}`,
    );
  }
}

function isSpeechRecognitionEnabled(): boolean {
  return getEnvString('SPEECH_RECOGNITION_ENABLED', 'true')!.trim().toLowerCase() === 'true';
}
