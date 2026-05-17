import { Inject, Injectable } from '@nestjs/common';
import type { ProviderRouteContext } from './food-query.types';
import { FoodProviderRegistry } from './food-provider-registry';
import { ProviderRouteConfigService, resolveRouteKey } from './provider-route-config.service';

@Injectable()
export class FoodQueryRouterService {
  constructor(
    @Inject(ProviderRouteConfigService)
    private readonly routeConfigService: ProviderRouteConfigService,
    @Inject(FoodProviderRegistry)
    private readonly providerRegistry: FoodProviderRegistry,
  ) {}

  resolveExecutionChain(context: ProviderRouteContext): {
    routeKey: string;
    providerCodes: string[];
  } {
    const routeKey = resolveRouteKey({
      inputType: context.inputType,
      foodType: context.foodType,
      imageType: context.imageType,
      hasBarcode: context.hasBarcode,
    });
    const configured = this.routeConfigService.resolveProviderCodes({
      market: context.market,
      routeKey,
    });

    let providerCodes = configured.filter((code) => {
      if (code === 'nutrition_label_ocr') {
        return shouldPrioritizeNutritionLabelOcr(context.imageType);
      }
      return this.providerRegistry.isEnabled(code);
    });

    if (shouldPrioritizeNutritionLabelOcr(context.imageType)) {
      providerCodes = prioritizeProvider(providerCodes, 'nutrition_label_ocr');
    }

    return { routeKey, providerCodes };
  }
}

function shouldPrioritizeNutritionLabelOcr(imageType?: ProviderRouteContext['imageType']): boolean {
  return imageType === 'nutrition_label'
    || imageType === 'packaged_food_front'
    || imageType === 'barcode_or_qr';
}

function prioritizeProvider(providerCodes: string[], prioritizedCode: string): string[] {
  const prioritized = providerCodes.filter((code) => code === prioritizedCode);
  if (prioritized.length === 0) {
    return providerCodes;
  }
  return [
    ...prioritized,
    ...providerCodes.filter((code) => code !== prioritizedCode),
  ];
}
