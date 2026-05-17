import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { generateId } from '@lumimax/runtime';
import { getEnvString } from '@lumimax/config';
import { resolveTenantId } from '../../common/tenant-scope.util';
import { getDefaultDietMarket } from '../market/diet-market';
import { FoodProviderRegistry } from './food-provider-registry';
import { FoodQueryService } from './food-query.service';
import { ProviderRouteConfigService } from './provider-route-config.service';
import type { FoodQueryInputType, FoodQueryMarket } from './food-query.types';
import { toFoodQueryMarket } from './food-query.types';

@Controller('debug')
export class FoodQueryDebugController {
  constructor(
    @Inject(FoodQueryService) private readonly foodQueryService: FoodQueryService,
    @Inject(FoodProviderRegistry) private readonly providerRegistry: FoodProviderRegistry,
    @Inject(ProviderRouteConfigService)
    private readonly routeConfigService: ProviderRouteConfigService,
  ) {}

  @Get('providers')
  listProviders() {
    this.assertDebugEnabled();
    return {
      routeConfig: this.routeConfigService.getConfig(),
      providers: this.providerRegistry.listStatuses(),
    };
  }

  @Get('food-query/search')
  async searchFood(
    @Query('q') query?: string,
    @Query('market') market?: string,
    @Query('inputType') inputType?: string,
    @Query('weightGram') weightGram?: string,
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
    @Query('locale') locale?: string,
    @Query('barcode') barcode?: string,
    @Query('requestId') requestId?: string,
  ) {
    this.assertDebugEnabled();
    const normalizedQuery = query?.trim();
    if (!normalizedQuery && !barcode?.trim()) {
      throw new Error('debug food-query search requires q or barcode');
    }

    const foodMarket = parseMarket(market);
    return this.foodQueryService.query({
      requestId: requestId?.trim() || generateId(),
      tenantId: tenantId?.trim() || resolveTenantId(),
      userId: userId?.trim() || undefined,
      market: foodMarket,
      inputType: parseInputType(inputType, barcode),
      query: normalizedQuery,
      barcode: barcode?.trim(),
      weightGram: parseWeightGram(weightGram),
      locale: locale?.trim(),
      countryCode: foodMarket === 'cn' ? 'CN' : foodMarket === 'us' ? 'US' : undefined,
    });
  }

  private assertDebugEnabled(): void {
    const enabled =
      getEnvString('FOOD_QUERY_DEBUG_ENABLED', 'false')!.trim().toLowerCase() === 'true';
    if (!enabled) {
      throw new NotFoundException();
    }
  }
}

function parseMarket(market?: string): FoodQueryMarket {
  const normalized = market?.trim().toUpperCase();
  if (normalized === 'CN' || normalized === 'US') {
    return toFoodQueryMarket(normalized);
  }
  return toFoodQueryMarket(getDefaultDietMarket());
}

function parseInputType(inputType?: string, barcode?: string): FoodQueryInputType {
  if (barcode?.trim()) {
    return 'barcode';
  }
  switch (inputType?.trim()) {
    case 'manual_text':
      return 'manual_text';
    case 'voice_text':
      return 'voice_text';
    case 'barcode':
      return 'barcode';
    case 'image':
      return 'image';
    case 'ocr_nutrition_label':
      return 'ocr_nutrition_label';
    case 'provider_candidate':
      return 'provider_candidate';
    default:
      return 'manual_text';
  }
}

function parseWeightGram(value?: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 100;
}
