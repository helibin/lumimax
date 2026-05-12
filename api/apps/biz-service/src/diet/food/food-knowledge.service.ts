import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { In } from 'typeorm';
import type {
  FoodEntity} from '../../common/entities/biz.entities';
import {
  ExternalFoodMappingEntity,
  FoodAliasEntity,
  FoodCorrectionEntity,
  FoodLocaleNameEntity,
} from '../../common/entities/biz.entities';
import { FoodIdentityService } from './food-identity.service';

@Injectable()
export class FoodKnowledgeService {
  constructor(
    @InjectRepository(FoodAliasEntity)
    private readonly foodAliasRepository: Repository<FoodAliasEntity>,
    @InjectRepository(FoodLocaleNameEntity)
    private readonly foodLocaleNameRepository: Repository<FoodLocaleNameEntity>,
    @InjectRepository(ExternalFoodMappingEntity)
    private readonly externalFoodMappingRepository: Repository<ExternalFoodMappingEntity>,
    @InjectRepository(FoodCorrectionEntity)
    private readonly foodCorrectionRepository: Repository<FoodCorrectionEntity>,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
  ) {}

  async findFoodIdsByNames(input: {
    tenantId: string;
    queryNames: string[];
  }): Promise<string[]> {
    const normalizedNames = dedupeStrings(
      input.queryNames.map((item) => this.foodIdentityService.normalizeName(item)),
    );
    if (normalizedNames.length === 0) {
      return [];
    }

    const [aliases, localeNames] = await Promise.all([
      this.foodAliasRepository.find({
        where: { tenantId: input.tenantId, normalizedAlias: In(normalizedNames) },
        take: 40,
      }),
      this.foodLocaleNameRepository.find({
        where: { tenantId: input.tenantId, normalizedName: In(normalizedNames) },
        take: 40,
      }),
    ]);

    return dedupeStrings([
      ...aliases.map((item) => item.foodId),
      ...localeNames.map((item) => item.foodId),
    ]);
  }

  async syncFoodIdentity(input: {
    food: FoodEntity;
    tenantId: string;
    locale?: string;
    countryCode?: string;
    aliases: string[];
    requestId: string;
  }): Promise<void> {
    const normalizedAliases = dedupeStrings(input.aliases);
    if (input.locale?.trim()) {
      await this.upsertLocaleName({
        foodId: input.food.id,
        tenantId: input.tenantId,
        locale: input.locale.trim(),
        countryCode: input.countryCode,
        displayName: input.food.name,
        requestId: input.requestId,
      });
    }

    for (const alias of normalizedAliases) {
      await this.upsertAlias({
        foodId: input.food.id,
        tenantId: input.tenantId,
        alias,
        locale: input.locale,
        countryCode: input.countryCode,
        source: 'diet.identity',
        confidence: 0.9,
        requestId: input.requestId,
      });
    }
  }

  async syncExternalMapping(input: {
    foodId: string;
    tenantId: string;
    providerCode: string;
    externalFoodId?: string;
    externalName?: string;
    locale?: string;
    countryCode?: string;
    confidence?: number;
    rawPayload?: Record<string, unknown>;
    requestId: string;
  }): Promise<void> {
    const externalFoodId = input.externalFoodId?.trim();
    if (!externalFoodId) {
      return;
    }

    const existing = await this.externalFoodMappingRepository.findOne({
      where: {
        tenantId: input.tenantId,
        foodId: input.foodId,
        providerCode: input.providerCode,
        externalFoodId,
      },
    });
    await this.externalFoodMappingRepository.save(
      this.externalFoodMappingRepository.create({
        id: existing?.id,
        tenantId: input.tenantId,
        foodId: input.foodId,
        providerCode: input.providerCode,
        externalFoodId,
        externalName: input.externalName?.trim() || null,
        locale: input.locale?.trim() || null,
        countryCode: input.countryCode?.trim() || null,
        rawPayload: input.rawPayload ?? existing?.rawPayload ?? null,
        confidence: toDecimalString(input.confidence ?? 0.8),
      }),
    );
  }

  async recordCorrection(input: {
    userId?: string;
    tenantId: string;
    mealRecordId?: string;
    mealItemId?: string;
    originalFoodName?: string;
    correctedFoodName?: string;
    originalWeightGram?: number;
    correctedWeightGram?: number;
    originalProviderCode?: string;
    correctedProviderCode?: string;
    correctionType?: string;
    extraJson?: Record<string, unknown>;
    requestId: string;
  }): Promise<void> {
    await this.foodCorrectionRepository.save(
      this.foodCorrectionRepository.create({
        tenantId: input.tenantId,
        userId: input.userId?.trim() || null,
        mealId: input.mealRecordId?.trim() || null,
        mealItemId: input.mealItemId?.trim() || null,
        originalFoodName: input.originalFoodName?.trim() || null,
        correctedFoodName: input.correctedFoodName?.trim() || null,
        originalWeightGram: nullableDecimal(input.originalWeightGram),
        correctedWeightGram: nullableDecimal(input.correctedWeightGram),
        originalProviderCode: input.originalProviderCode?.trim() || null,
        correctedProviderCode: input.correctedProviderCode?.trim() || null,
        correctionType: input.correctionType?.trim() || 'manual_confirm',
        extraJson: input.extraJson ?? null,
      }),
    );
  }

  private async upsertAlias(input: {
    foodId: string;
    tenantId: string;
    alias: string;
    locale?: string;
    countryCode?: string;
    source: string;
    confidence: number;
    requestId: string;
  }): Promise<void> {
    const alias = input.alias.trim();
    if (!alias) {
      return;
    }
    const normalizedAlias = this.foodIdentityService.normalizeName(alias);
    const existing = await this.foodAliasRepository.findOne({
      where: { tenantId: input.tenantId, foodId: input.foodId, normalizedAlias },
    });
    await this.foodAliasRepository.save(
      this.foodAliasRepository.create({
        id: existing?.id,
        tenantId: input.tenantId,
        foodId: input.foodId,
        alias,
        normalizedAlias,
        locale: input.locale?.trim() || null,
        countryCode: input.countryCode?.trim() || null,
        source: input.source,
        confidence: toDecimalString(input.confidence),
      }),
    );
  }

  private async upsertLocaleName(input: {
    foodId: string;
    tenantId: string;
    locale: string;
    countryCode?: string;
    displayName: string;
    requestId: string;
  }): Promise<void> {
    const normalizedName = this.foodIdentityService.normalizeName(input.displayName);
    const existing = await this.foodLocaleNameRepository.findOne({
      where: {
        tenantId: input.tenantId,
        foodId: input.foodId,
        locale: input.locale,
        normalizedName,
      },
    });
    await this.foodLocaleNameRepository.save(
      this.foodLocaleNameRepository.create({
        id: existing?.id,
        tenantId: input.tenantId,
        foodId: input.foodId,
        locale: input.locale,
        countryCode: input.countryCode?.trim() || null,
        displayName: input.displayName,
        normalizedName,
      }),
    );
  }
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function toDecimalString(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function nullableDecimal(value?: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return toDecimalString(value);
}
