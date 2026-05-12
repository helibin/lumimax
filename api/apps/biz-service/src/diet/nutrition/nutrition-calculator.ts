import { Injectable } from '@nestjs/common';

@Injectable()
export class NutritionCalculator {
  scalePer100g(input: {
    weightGram: number;
    caloriesPer100g: number;
    proteinPer100g: number;
    fatPer100g: number;
    carbsPer100g: number;
  }): {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  } {
    const ratio = Math.max(input.weightGram, 1) / 100;
    return {
      calories: round(input.caloriesPer100g * ratio),
      protein: round(input.proteinPer100g * ratio),
      fat: round(input.fatPer100g * ratio),
      carbs: round(input.carbsPer100g * ratio),
    };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
