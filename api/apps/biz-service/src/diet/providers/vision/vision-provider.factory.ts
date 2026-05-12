import { Inject, Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import type {
  FoodVisionProvider,
  NamedFoodVisionProvider,
} from '../../interfaces/provider.contracts';
import { GeminiVisionProvider } from './gemini-vision.provider';
import { OpenAiVisionProvider } from './openai-vision.provider';
import { QwenVisionProvider } from './qwen-vision.provider';

@Injectable()
export class VisionProviderFactory {
  private readonly registry: Record<string, FoodVisionProvider>;

  constructor(
    @Inject(OpenAiVisionProvider)
    private readonly openAiVisionProvider: OpenAiVisionProvider,
    @Inject(GeminiVisionProvider)
    private readonly geminiVisionProvider: GeminiVisionProvider,
    @Inject(QwenVisionProvider)
    private readonly qwenVisionProvider: QwenVisionProvider,
  ) {
    this.registry = {
      openai: this.openAiVisionProvider,
      gemini: this.geminiVisionProvider,
      qwen: this.qwenVisionProvider,
    };
  }

  resolveActive(): NamedFoodVisionProvider {
    const name = getEnvString('LLM_VISION_PROVIDER', 'openai')!.trim().toLowerCase();
    return {
      name,
      provider: this.resolve(name),
    };
  }

  resolve(name: string): FoodVisionProvider {
    const provider = this.registry[name.trim().toLowerCase()];
    if (!provider) {
      throw new Error(`不支持的 LLM_VISION_PROVIDER: ${name}`);
    }
    return provider;
  }
}
