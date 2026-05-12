import { Inject, Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import type {
  NamedNutritionDataProvider,
  NutritionDataProvider,
} from '../interfaces/provider.contracts';
import { BooheeProvider } from './boohee/boohee.provider';
import { EdamamProvider } from './edamam/edamam.provider';
import { NutritionixProvider } from './nutritionix/nutritionix.provider';
import { OpenFoodFactsProvider } from './open-food-facts/open-food-facts.provider';
import { UsdaFdcProvider } from './usda-fdc/usda-fdc.provider';

@Injectable()
export class NutritionDataProviderFactory {
  private readonly registry: Record<string, NutritionDataProvider>;

  constructor(
    @Inject(NutritionixProvider)
    private readonly nutritionixProvider: NutritionixProvider,
    @Inject(BooheeProvider)
    private readonly booheeProvider: BooheeProvider,
    @Inject(UsdaFdcProvider) private readonly usdaFdcProvider: UsdaFdcProvider,
    @Inject(OpenFoodFactsProvider)
    private readonly openFoodFactsProvider: OpenFoodFactsProvider,
    @Inject(EdamamProvider) private readonly edamamProvider: EdamamProvider,
  ) {
    this.registry = {
      nutritionix: this.nutritionixProvider,
      boohee: this.booheeProvider,
      usda_fdc: this.usdaFdcProvider,
      open_food_facts: this.openFoodFactsProvider,
      edamam: this.edamamProvider,
    };
  }

  resolveAll(): NamedNutritionDataProvider[] {
    return this.providerOrder()
      .filter((name) => this.isEnabled(name))
      .map((name) => ({
        name,
        provider: this.resolve(name),
      }));
  }

  resolveEnabledNames(names: string[]): string[] {
    return names
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
      .filter((name) => this.isRegistered(name))
      .filter((name) => this.isEnabled(name));
  }

  resolve(name: string): NutritionDataProvider {
    const normalized = name.trim().toLowerCase();
    if (!this.isEnabled(normalized)) {
      throw new Error(`营养数据源 ${normalized} 因缺少配置已被禁用`);
    }
    const provider = this.registry[normalized];
    if (!provider) {
      throw new Error(`不支持的营养数据源: ${name}`);
    }
    return provider;
  }

  private providerOrder(): string[] {
    return getEnvString('NUTRITION_DATA_PROVIDERS', 'nutritionix,boohee,usda_fdc,edamam')!
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  private isEnabled(name: string): boolean {
    switch (name.trim().toLowerCase()) {
      case 'nutritionix':
        return hasNutritionixConfig();
      default:
        return true;
    }
  }

  private isRegistered(name: string): boolean {
    return Boolean(this.registry[name.trim().toLowerCase()]);
  }
}

function hasNutritionixConfig(): boolean {
  return Boolean(
    getEnvString('NUTRITIONIX_APP_ID', '')!.trim()
    && getEnvString('NUTRITIONIX_API_KEY', '')!.trim(),
  );
}
