import { Inject, Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import type { NutritionEstimatorProvider } from '../../interfaces/provider.contracts';
import { GeminiNutritionEstimatorProvider } from './gemini-nutrition-estimator.provider';
import { OpenAiNutritionEstimatorProvider } from './openai-nutrition-estimator.provider';
import { QwenNutritionEstimatorProvider } from './qwen-nutrition-estimator.provider';

@Injectable()
export class NutritionEstimatorFactory {
  private readonly registry: Record<string, NutritionEstimatorProvider>;

  constructor(
    @Inject(OpenAiNutritionEstimatorProvider)
    private readonly openAiNutritionEstimatorProvider: OpenAiNutritionEstimatorProvider,
    @Inject(GeminiNutritionEstimatorProvider)
    private readonly geminiNutritionEstimatorProvider: GeminiNutritionEstimatorProvider,
    @Inject(QwenNutritionEstimatorProvider)
    private readonly qwenNutritionEstimatorProvider: QwenNutritionEstimatorProvider,
  ) {
    this.registry = {
      openai: this.openAiNutritionEstimatorProvider,
      gemini: this.geminiNutritionEstimatorProvider,
      qwen: this.qwenNutritionEstimatorProvider,
    };
  }

  resolve(): NutritionEstimatorProvider {
    const provider = getEnvString('LLM_NUTRITION_PROVIDER', 'openai')!
      .trim()
      .toLowerCase();
    return this.resolveByName(provider);
  }

  private resolveByName(name: string): NutritionEstimatorProvider {
    const provider = this.registry[name];
    if (!provider) {
      throw new Error(`Unsupported LLM_NUTRITION_PROVIDER: ${name}`);
    }
    return provider;
  }
}
