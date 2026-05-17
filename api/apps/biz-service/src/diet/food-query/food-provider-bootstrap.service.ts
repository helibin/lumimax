import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import { FoodIdentityService } from '../food/food-identity.service';
import { BooheeProvider } from '../providers/boohee/boohee.provider';
import { EdamamProvider } from '../providers/edamam/edamam.provider';
import { UsdaFdcProvider } from '../providers/usda-fdc/usda-fdc.provider';
import { VisionProviderFactory } from '../providers/vision/vision-provider.factory';
import { FoodProviderRegistry } from './food-provider-registry';
import { InternalFoodProvider } from './providers/internal-food.provider';
import { LlmEstimateFoodProvider } from './providers/llm-estimate-food.provider';
import { NutritionLabelOcrProvider } from './providers/nutrition-label-ocr.provider';
import {
  NutritionDataProviderAdapter,
  VisionProviderAdapter,
} from './providers/nutrition-data.adapter';

@Injectable()
export class FoodProviderBootstrapService implements OnModuleInit {
  constructor(
    @Inject(FoodProviderRegistry) private readonly registry: FoodProviderRegistry,
    @Inject(InternalFoodProvider) private readonly internalFoodProvider: InternalFoodProvider,
    @Inject(LlmEstimateFoodProvider) private readonly llmEstimateFoodProvider: LlmEstimateFoodProvider,
    @Inject(NutritionLabelOcrProvider)
    private readonly nutritionLabelOcrProvider: NutritionLabelOcrProvider,
    @Inject(BooheeProvider) private readonly booheeProvider: BooheeProvider,
    @Inject(UsdaFdcProvider) private readonly usdaProvider: UsdaFdcProvider,
    @Inject(EdamamProvider) private readonly edamamProvider: EdamamProvider,
    @Inject(VisionProviderFactory) private readonly visionProviderFactory: VisionProviderFactory,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.internalFoodProvider);
    this.registry.register(this.llmEstimateFoodProvider);
    this.registry.register(this.nutritionLabelOcrProvider);
    this.registry.register(
      new NutritionDataProviderAdapter(
        'boohee',
        this.booheeProvider,
        this.foodIdentityService,
        () => hasBooheeConfig(),
      ),
    );
    this.registry.register(
      new NutritionDataProviderAdapter(
        'usda',
        this.usdaProvider,
        this.foodIdentityService,
        () => isProviderEnabled('USDA_ENABLED', true),
      ),
    );
    this.registry.register(
      new NutritionDataProviderAdapter(
        'edamam',
        this.edamamProvider,
        this.foodIdentityService,
        () => hasEdamamConfig(),
      ),
    );
    const visionEntry = this.visionProviderFactory.resolveActive();
    this.registry.register(
      new VisionProviderAdapter(
        'vision',
        visionEntry.provider,
        this.foodIdentityService,
        () => true,
      ),
    );
  }
}

function isProviderEnabled(key: string, defaultValue: boolean): boolean {
  const value = getEnvString(key, defaultValue ? 'true' : 'false')!.trim().toLowerCase();
  return value === 'true' || value === '1';
}

function hasEdamamConfig(): boolean {
  return Boolean(
    getEnvString('EDAMAM_APP_ID', '')!.trim()
    && getEnvString('EDAMAM_APP_KEY', '')!.trim(),
  );
}

function hasBooheeConfig(): boolean {
  return isProviderEnabled('BOOHEE_ENABLED', true)
    && Boolean(getEnvString('BOOHEE_BASE_URL', '')!.trim())
    && Boolean(getEnvString('BOOHEE_APP_ID', '')!.trim())
    && Boolean(getEnvString('BOOHEE_APP_KEY', '')!.trim());
}
