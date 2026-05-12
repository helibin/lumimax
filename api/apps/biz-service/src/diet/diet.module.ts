import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { FoodAnalysisService } from './food-analysis/food-analysis.service';
import { FoodIdentityService } from './food/food-identity.service';
import { FoodKnowledgeService } from './food/food-knowledge.service';
import { RecognitionLogService } from './food-analysis/recognition-log.service';
import { FoodService } from './food/food.service';
import { UserFoodProfileService } from './food/user-food-profile.service';
import { GeminiNutritionEstimatorProvider } from './providers/estimator/gemini-nutrition-estimator.provider';
import { OpenAiNutritionEstimatorProvider } from './providers/estimator/openai-nutrition-estimator.provider';
import { QwenNutritionEstimatorProvider } from './providers/estimator/qwen-nutrition-estimator.provider';
import { NutritionEstimatorFactory } from './providers/estimator/nutrition-estimator.factory';
import { NutritionDataProviderFactory } from './providers/nutrition-data-provider.factory';
import { BooheeProvider } from './providers/boohee/boohee.provider';
import { EdamamProvider } from './providers/edamam/edamam.provider';
import { NutritionixProvider } from './providers/nutritionix/nutritionix.provider';
import { OpenFoodFactsProvider } from './providers/open-food-facts/open-food-facts.provider';
import { DietProviderHttpClient } from './providers/provider-http.client';
import { UsdaFdcProvider } from './providers/usda-fdc/usda-fdc.provider';
import { GeminiVisionProvider } from './providers/vision/gemini-vision.provider';
import { OpenAiVisionProvider } from './providers/vision/openai-vision.provider';
import { QwenVisionProvider } from './providers/vision/qwen-vision.provider';
import { VisionProviderFactory } from './providers/vision/vision-provider.factory';
import { DietApplicationService } from './meal/diet-application.service';
import { DietController } from './meal/diet.controller';
import { DietFacadeGrpcController } from './diet.facade.grpc.controller';
import { DietFacade } from './diet.facade';
import { DietImageStorageService } from './food-analysis/diet-image-storage.service';
import { DietService } from './meal/diet.service';
import { NutritionCalculator } from './nutrition/nutrition-calculator';
import { NutritionProviderRouterService } from './nutrition/nutrition-provider-router.service';
import { NutritionRankingService } from './nutrition/nutrition-ranking.service';
import { NutritionService } from './nutrition/nutrition.service';

@Module({
  imports: [PersistenceModule],
  controllers: [DietController, DietFacadeGrpcController],
  providers: [
    DietService,
    DietApplicationService,
    DietFacade,
    DietImageStorageService,
    FoodAnalysisService,
    RecognitionLogService,
    FoodIdentityService,
    FoodKnowledgeService,
    UserFoodProfileService,
    FoodService,
    NutritionService,
    NutritionCalculator,
    NutritionProviderRouterService,
    NutritionRankingService,
    DietProviderHttpClient,
    OpenAiVisionProvider,
    GeminiVisionProvider,
    QwenVisionProvider,
    VisionProviderFactory,
    NutritionDataProviderFactory,
    NutritionixProvider,
    BooheeProvider,
    UsdaFdcProvider,
    OpenFoodFactsProvider,
    EdamamProvider,
    OpenAiNutritionEstimatorProvider,
    GeminiNutritionEstimatorProvider,
    QwenNutritionEstimatorProvider,
    NutritionEstimatorFactory,
  ],
  exports: [
    DietService,
    DietApplicationService,
    DietFacade,
    DietImageStorageService,
    FoodAnalysisService,
    RecognitionLogService,
    FoodIdentityService,
    FoodKnowledgeService,
    UserFoodProfileService,
    FoodService,
    NutritionService,
    NutritionCalculator,
    NutritionProviderRouterService,
    NutritionRankingService,
    VisionProviderFactory,
    NutritionDataProviderFactory,
    NutritionEstimatorFactory,
  ],
})
export class DietModule {}
