import { Injectable } from '@nestjs/common';
import type { FoodNutritionProvider } from './food-query.types';

@Injectable()
export class FoodProviderRegistry {
  private readonly providers = new Map<string, FoodNutritionProvider>();

  register(provider: FoodNutritionProvider): void {
    this.providers.set(provider.code, provider);
  }

  get(code: string): FoodNutritionProvider | undefined {
    return this.providers.get(code.trim().toLowerCase());
  }

  isEnabled(code: string): boolean {
    return this.providers.get(code.trim().toLowerCase())?.isEnabled() ?? false;
  }

  listStatuses() {
    return [...this.providers.values()].map((provider) => provider.getStatus());
  }
}
