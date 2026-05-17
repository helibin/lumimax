import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { OpenAiSpeechProvider } from './providers/openai/openai-speech.provider';
import { TencentSpeechProvider } from './providers/tencent/tencent-speech.provider';
import { SpeechProviderRegistry } from './speech-provider-registry';

@Injectable()
export class SpeechProviderBootstrapService implements OnModuleInit {
  constructor(
    @Inject(SpeechProviderRegistry) private readonly registry: SpeechProviderRegistry,
    @Inject(TencentSpeechProvider) private readonly tencentSpeechProvider: TencentSpeechProvider,
    @Inject(OpenAiSpeechProvider) private readonly openAiSpeechProvider: OpenAiSpeechProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.tencentSpeechProvider);
    this.registry.register(this.openAiSpeechProvider);
  }
}
