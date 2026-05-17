import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { FoodIdentityService } from './food/food-identity.service';
import { FoodKnowledgeService } from './food/food-knowledge.service';
import { RecognitionLogService } from './food-analysis/recognition-log.service';
import { FoodService } from './food/food.service';
import { UserFoodProfileService } from './food/user-food-profile.service';
import { FoodPersistenceService } from './food-query/food-persistence.service';
import { FoodProviderBootstrapService } from './food-query/food-provider-bootstrap.service';
import { FoodProviderRegistry } from './food-query/food-provider-registry';
import { FoodQueryRouterService } from './food-query/food-query-router.service';
import { FoodQueryService } from './food-query/food-query.service';
import { InternalFoodProvider } from './food-query/providers/internal-food.provider';
import { LlmEstimateFoodProvider } from './food-query/providers/llm-estimate-food.provider';
import { NutritionLabelOcrProvider } from './food-query/providers/nutrition-label-ocr.provider';
import { ProviderRouteConfigService } from './food-query/provider-route-config.service';
import { GeminiNutritionEstimatorProvider } from './providers/estimator/gemini-nutrition-estimator.provider';
import { OpenAiNutritionEstimatorProvider } from './providers/estimator/openai-nutrition-estimator.provider';
import { QwenNutritionEstimatorProvider } from './providers/estimator/qwen-nutrition-estimator.provider';
import { NutritionEstimatorFactory } from './providers/estimator/nutrition-estimator.factory';
import { BooheeProvider } from './providers/boohee/boohee.provider';
import { EdamamProvider } from './providers/edamam/edamam.provider';
import { DietProviderHttpClient } from './providers/provider-http.client';
import { UsdaFdcProvider } from './providers/usda-fdc/usda-fdc.provider';
import { GeminiVisionProvider } from './providers/vision/gemini-vision.provider';
import { OpenAiVisionProvider } from './providers/vision/openai-vision.provider';
import { QwenVisionProvider } from './providers/vision/qwen-vision.provider';
import { OpenAiSpeechProvider } from '../speech/providers/openai/openai-speech.provider';
import { TencentSpeechProvider } from '../speech/providers/tencent/tencent-speech.provider';
import { SpeechProviderBootstrapService } from '../speech/speech-provider-bootstrap.service';
import { SpeechProviderRegistry } from '../speech/speech-provider-registry';
import { SpeechRecognitionRouterService } from '../speech/speech-recognition-router.service';
import { SpeechRecognitionService } from '../speech/speech-recognition.service';
import { SpeechRouteConfigService } from '../speech/speech-route-config.service';
import { VisionProviderFactory } from './providers/vision/vision-provider.factory';
import { DietApplicationService } from './meal/diet-application.service';
import { FoodQueryDebugController } from './food-query/food-query-debug.controller';
import { DietFacadeGrpcController } from './diet.facade.grpc.controller';
import { DietFacade } from './diet.facade';
import { DietImageStorageService } from './food-analysis/diet-image-storage.service';
import { DietService } from './meal/diet.service';
import { NutritionCalculator } from './nutrition/nutrition-calculator';
import { NutritionRankingService } from './nutrition/nutrition-ranking.service';

@Module({
  imports: [PersistenceModule],
  controllers: [FoodQueryDebugController, DietFacadeGrpcController],
  providers: [
    DietService,
    DietApplicationService,
    DietFacade,
    DietImageStorageService,
    RecognitionLogService,
    FoodIdentityService,
    FoodKnowledgeService,
    UserFoodProfileService,
    FoodService,
    FoodQueryService,
    FoodQueryRouterService,
    FoodProviderRegistry,
    FoodProviderBootstrapService,
    ProviderRouteConfigService,
    FoodPersistenceService,
    InternalFoodProvider,
    LlmEstimateFoodProvider,
    NutritionLabelOcrProvider,
    NutritionCalculator,
    NutritionRankingService,
    DietProviderHttpClient,
    OpenAiVisionProvider,
    GeminiVisionProvider,
    QwenVisionProvider,
    VisionProviderFactory,
    BooheeProvider,
    UsdaFdcProvider,
    EdamamProvider,
    OpenAiNutritionEstimatorProvider,
    GeminiNutritionEstimatorProvider,
    QwenNutritionEstimatorProvider,
    NutritionEstimatorFactory,
    SpeechProviderRegistry,
    SpeechProviderBootstrapService,
    SpeechRouteConfigService,
    SpeechRecognitionRouterService,
    SpeechRecognitionService,
    TencentSpeechProvider,
    OpenAiSpeechProvider,
  ],
  exports: [
    DietService,
    DietApplicationService,
    DietFacade,
    DietImageStorageService,
    RecognitionLogService,
    FoodIdentityService,
    FoodKnowledgeService,
    UserFoodProfileService,
    FoodService,
    FoodQueryService,
    NutritionCalculator,
    NutritionRankingService,
    VisionProviderFactory,
    NutritionEstimatorFactory,
    SpeechRecognitionService,
  ],
})
export class DietModule {}
