import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import { getDefaultLocale } from '../config/default-locale';
import { getDefaultDietMarket, type DietMarket, DIET_MARKET_VALUES } from '../diet/market/diet-market';
import {
  DIET_ROUTE_MARKET_ORDER,
  listRouteProviderNamesForMarket,
} from '../diet/nutrition/nutrition-provider-router.service';

export type ThirdPartyProbeStatus = 'up' | 'down' | 'skipped';

export interface ThirdPartyProbeResult {
  name: string;
  target: string;
  status: ThirdPartyProbeStatus;
  detail: string;
  checkedAt: string;
  markets?: DietMarket[];
  scope?: 'global' | 'market';
}

export interface ThirdPartyAvailabilityReport {
  enabled: boolean;
  strict: boolean;
  status: 'ok' | 'degraded' | 'error' | 'disabled';
  checkedAt?: string;
  items: ThirdPartyProbeResult[];
}

@Injectable()
export class ThirdPartyAvailabilityService implements OnModuleInit {
  private report: ThirdPartyAvailabilityReport = {
    enabled: false,
    strict: false,
    status: 'disabled',
    items: [],
  };

  constructor(@Inject(AppLogger) private readonly logger: AppLogger) {}

  async onModuleInit(): Promise<void> {
    if (!isStartupCheckEnabled()) {
      this.report = {
        enabled: false,
        strict: isStartupCheckStrict(),
        status: 'disabled',
        items: [],
      };
      this.logger.debug(
        '饮食中心第三方识别路由启动检测已关闭',
        { suppressRequestContext: true },
        ThirdPartyAvailabilityService.name,
      );
      return;
    }

    const report = await this.runChecks();
    this.report = report;

    if (report.status === 'ok') {
      this.logger.debug(
        renderAvailabilityLogMessage('饮食中心第三方识别路由启动检测完成', report),
        {
          suppressRequestContext: true,
          status: report.status,
          checkedAt: report.checkedAt,
          items: report.items,
        },
        ThirdPartyAvailabilityService.name,
      );
      return;
    }

    const message = summarizeFailedChecks(report.items);
    if (report.strict) {
      this.logger.error(
        renderAvailabilityLogMessage('饮食中心第三方识别路由启动检测失败，已阻止服务启动', report),
        {
          suppressRequestContext: true,
          status: report.status,
          checkedAt: report.checkedAt,
          items: report.items,
        },
        ThirdPartyAvailabilityService.name,
      );
      throw new Error(`第三方可用性启动检测失败: ${message}`);
    }

    this.logger.warn(
      renderAvailabilityLogMessage('饮食中心第三方识别路由启动检测存在异常', report),
      {
        suppressRequestContext: true,
        status: report.status,
        checkedAt: report.checkedAt,
        items: report.items,
      },
      ThirdPartyAvailabilityService.name,
    );
  }

  getReport(): ThirdPartyAvailabilityReport {
    return this.report;
  }

  private async runChecks(): Promise<ThirdPartyAvailabilityReport> {
    const checkedAt = new Date().toISOString();
    const items = await Promise.all(this.buildTargets().map((target) => this.probe(target)));
    const hasDown = items.some((item) => item.status === 'down');
    const hasUp = items.some((item) => item.status === 'up');

    return {
      enabled: true,
      strict: isStartupCheckStrict(),
      status: hasDown ? (hasUp ? 'degraded' : 'error') : 'ok',
      checkedAt,
      items,
    };
  }

  private buildTargets(): Array<{
    name: string;
    url: string;
    staticDetail?: string;
    markets?: DietMarket[];
    scope?: 'global' | 'market';
  }> {
    const targets: Array<{
      name: string;
      url: string;
      staticDetail?: string;
      markets?: DietMarket[];
      scope?: 'global' | 'market';
    }> = [];
    const visionProvider = getEnvString('LLM_VISION_PROVIDER', 'openai')!.trim().toLowerCase();
    const nutritionProvider = getEnvString('LLM_NUTRITION_PROVIDER', 'openai')!.trim().toLowerCase();
    const visionModel = getEnvString('LLM_VISION_MODEL', 'gpt-4.1-mini')!.trim();
    const nutritionModel = getEnvString('LLM_NUTRITION_MODEL', 'gpt-4.1-mini')!.trim();

    if (visionProvider === 'openai' || visionProvider === 'gemini' || visionProvider === 'qwen') {
      targets.push({
        name: buildLlmTargetName('llm_vision', visionModel),
        url: normalizeProbeUrl(resolveLlmBaseUrl('vision', visionProvider)),
        scope: 'global',
      });
    }

    const providerMarkets = buildProviderMarketMap();
    for (const [providerName, markets] of providerMarkets.entries()) {
      const target = this.buildMarketTarget(providerName, markets);
      if (target) {
        targets.push(target);
      }
    }

    if (nutritionProvider === 'openai' || nutritionProvider === 'gemini' || nutritionProvider === 'qwen') {
      targets.push({
        name: buildLlmTargetName('llm_nutrition', nutritionModel),
        url: normalizeProbeUrl(resolveLlmBaseUrl('nutrition', nutritionProvider)),
        scope: 'global',
      });
    }

    return targets;
  }

  private buildMarketTarget(
    providerName: string,
    markets: DietMarket[],
  ): { name: string; url: string; staticDetail?: string; markets: DietMarket[]; scope: 'market' } | undefined {
    switch (providerName) {
      case 'boohee':
        return {
          name: 'boohee (cn realtime slot)',
          url: '',
          staticDetail: '暂未接入',
          markets,
          scope: 'market',
        };
      case 'nutritionix':
        if (hasNutritionixConfig()) {
          return {
            name: 'nutritionix',
            url: normalizeProbeUrl(getEnvString('NUTRITIONIX_BASE_URL', 'https://trackapi.nutritionix.com')!),
            markets,
            scope: 'market',
          };
        }
        return undefined;
      case 'usda_fdc':
        if (hasValue(getEnvString('USDA_FDC_API_KEY', '')!)) {
          return {
            name: 'usda_fdc',
            url: normalizeProbeUrl(getEnvString('USDA_FDC_BASE_URL', 'https://api.nal.usda.gov/fdc/v1')!),
            markets,
            scope: 'market',
          };
        }
        return undefined;
      case 'edamam':
        if (hasValue(getEnvString('EDAMAM_APP_ID', '')!) && hasValue(getEnvString('EDAMAM_API_KEY', '')!)) {
          return {
            name: 'edamam',
            url: normalizeProbeUrl(getEnvString('EDAMAM_BASE_URL', 'https://api.edamam.com')!),
            markets,
            scope: 'market',
          };
        }
        return undefined;
      default:
        return undefined;
    }
  }

  private async probe(target: {
    name: string;
    url: string;
    staticDetail?: string;
    markets?: DietMarket[];
    scope?: 'global' | 'market';
  }): Promise<ThirdPartyProbeResult> {
    const checkedAt = new Date().toISOString();
    if (!target.url) {
      return {
        name: target.name,
        target: target.url,
        status: 'skipped',
        detail: target.staticDetail ?? '未配置检测地址',
        checkedAt,
        markets: target.markets,
        scope: target.scope,
      };
    }

    const controller = new AbortController();
    const timeoutMs = getStartupCheckTimeoutMs();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(target.url, {
        method: 'GET',
        signal: controller.signal,
      });
      return {
        name: target.name,
        target: target.url,
        status: 'up',
        detail: `HTTP ${response.status}`,
        checkedAt,
        markets: target.markets,
        scope: target.scope,
      };
    } catch (error) {
      return {
        name: target.name,
        target: target.url,
        status: 'down',
        detail: resolveProbeErrorMessage(error, timeoutMs),
        checkedAt,
        markets: target.markets,
        scope: target.scope,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isStartupCheckEnabled(): boolean {
  return getEnvString('STARTUP_THIRD_PARTY_CHECK_ENABLED', 'true')!.trim().toLowerCase() !== 'false';
}

function isStartupCheckStrict(): boolean {
  return getEnvString('STARTUP_THIRD_PARTY_CHECK_STRICT', 'false')!.trim().toLowerCase() === 'true';
}

function getStartupCheckTimeoutMs(): number {
  return getEnvNumber('STARTUP_THIRD_PARTY_CHECK_TIMEOUT_MS', 5000);
}

function hasNutritionixConfig(): boolean {
  return hasValue(getEnvString('NUTRITIONIX_APP_ID', '')!)
    && hasValue(getEnvString('NUTRITIONIX_API_KEY', '')!);
}

function hasValue(value: string): boolean {
  return Boolean(value.trim());
}

function buildProviderMarketMap(): Map<string, DietMarket[]> {
  const providerMarkets = new Map<string, DietMarket[]>();

  for (const market of DIET_ROUTE_MARKET_ORDER) {
    for (const providerName of listRouteProviderNamesForMarket(market)) {
      const markets = providerMarkets.get(providerName) ?? [];
      if (!markets.includes(market)) {
        markets.push(market);
      }
      providerMarkets.set(providerName, markets);
    }
  }

  return providerMarkets;
}

function resolveLlmBaseUrl(
  channel: 'vision' | 'nutrition',
  provider: string,
): string {
  const envName = channel === 'vision' ? 'LLM_VISION_BASE_URL' : 'LLM_NUTRITION_BASE_URL';
  const configured = getEnvString(envName, '')!.trim();
  if (configured) {
    return configured;
  }
  if (provider === 'gemini') {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }
  if (provider === 'qwen') {
    return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }
  return 'https://api.openai.com/v1';
}

function buildLlmTargetName(baseName: string, model: string): string {
  const normalizedModel = model.trim() || 'unknown';
  return `${baseName} (${normalizedModel})`;
}

function normalizeProbeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname}`;
  } catch {
    return trimmed;
  }
}

function resolveProbeErrorMessage(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return `连接超时（${timeoutMs}ms）`;
  }
  return error instanceof Error ? error.message : String(error);
}

function formatLocalTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function summarizeFailedChecks(items: ThirdPartyProbeResult[]): string {
  return items
    .filter((item) => item.status === 'down')
    .map((item) => `${item.name}: ${item.detail}`)
    .join('; ');
}

function renderAvailabilityLogMessage(
  title: string,
  report: ThirdPartyAvailabilityReport,
): string {
  const lines = [title];
  lines.push(`当前市场: ${DIET_MARKET_VALUES.join(', ')}（默认: ${getDefaultDietMarket()}）`);
  lines.push(`默认语言: ${getDefaultLocale()}`);
  if (report.checkedAt) {
    lines.push(`检测时间: ${formatLocalTimestamp(report.checkedAt)}`);
  }
  lines.push(...renderAvailabilitySections(report.items));
  return lines.join('\n');
}

function renderAvailabilitySections(items: ThirdPartyProbeResult[]): string[] {
  if (items.length === 0) {
    return [];
  }

  const sections: string[] = [];
  const globalItems = items.filter((item) => item.scope === 'global');
  if (globalItems.length > 0) {
    sections.push('公共能力');
    sections.push(renderAvailabilityTable(globalItems));
  }

  for (const market of DIET_ROUTE_MARKET_ORDER) {
    const marketItems = items.filter((item) => item.scope === 'market' && item.markets?.includes(market));
    if (marketItems.length === 0) {
      continue;
    }
    sections.push(`${market} 路由探测`);
    sections.push(renderAvailabilityTable(marketItems));
  }

  return sections;
}

function renderAvailabilityTable(items: ThirdPartyProbeResult[]): string {
  const headers = ['序号', '路由', '状态', '详情', '检测时间'];
  const rows = items.map((item, index) => [
    String(index + 1),
    item.name,
    item.status,
    item.detail,
    formatLocalTimestamp(item.checkedAt),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(
      getDisplayWidth(header),
      ...rows.map((row) => getDisplayWidth(row[index] ?? '')),
    ),
  );

  const border = `+-${widths.map((width) => '-'.repeat(width)).join('-+-')}-+`;
  const headerLine = `| ${headers.map((header, index) => padDisplayEnd(header, widths[index])).join(' | ')} |`;
  const rowLines = rows.map((row) =>
    `| ${row.map((cell, index) => padDisplayEnd(cell ?? '', widths[index])).join(' | ')} |`,
  );

  return [border, headerLine, border, ...rowLines, border].join('\n');
}

function padDisplayEnd(value: string, targetWidth: number): string {
  const width = getDisplayWidth(value);
  if (width >= targetWidth) {
    return value;
  }
  return `${value}${' '.repeat(targetWidth - width)}`;
}

function getDisplayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += isWideChar(char) ? 2 : 1;
  }
  return width;
}

function isWideChar(char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f)
    || (codePoint >= 0x2329 && codePoint <= 0x232a)
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}
