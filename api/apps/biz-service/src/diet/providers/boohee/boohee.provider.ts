import { Injectable } from '@nestjs/common';
import type {
  GetNutritionInput,
  NutritionDataProvider,
  NutritionResult,
  NutritionSearchResult,
  SearchFoodInput,
} from '../../interfaces/provider.contracts';

@Injectable()
export class BooheeProvider implements NutritionDataProvider {
  async searchFood(_input: SearchFoodInput): Promise<NutritionSearchResult> {
    return {
      items: [],
    };
  }

  async getNutrition(input: GetNutritionInput): Promise<NutritionResult> {
    const query = input.query?.trim() || input.id?.trim() || 'unknown food';
    return {
      name: query,
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      source: 'boohee',
      raw: {
        placeholder: true,
      },
    };
  }
}
