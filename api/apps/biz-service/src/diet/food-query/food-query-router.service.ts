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
      hasBarcode: context.hasBarcode,
    });
    const configured = this.routeConfigService.resolveProviderCodes({
      market: context.market,
      routeKey,
    });

    const providerCodes = configured.filter((code) => {
      if (code === 'nutrition_label_ocr') {
        return context.inputType === 'ocr_nutrition_label';
      }
      return this.providerRegistry.isEnabled(code);
    });

    return { routeKey, providerCodes };
  }
}
