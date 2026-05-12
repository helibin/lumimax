import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnvService } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';

void EnvService;
void AppLogger;

export interface AggregatedDocsItem {
  name: string;
  docsUrl: string;
  openapiUrl: string;
}

interface DocsRegistryItem extends AggregatedDocsItem {
  openapiTargetUrl: string;
}

interface OpenApiCacheEntry {
  expiresAt: number;
  payload: unknown;
}

type OpenApiPaths = Record<string, Record<string, unknown>>;

@Injectable()
export class DocsService {
  private readonly registry: DocsRegistryItem[];
  private readonly cache = new Map<string, OpenApiCacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly fetchTimeoutMs: number;
  private readonly envService: EnvService;
  private readonly logger: AppLogger;

  constructor(
    envService: EnvService,
    logger: AppLogger,
  ) {
    this.envService = envService;
    this.logger = logger;
    const gatewayPort = this.envService.getNumber('HTTP_PORT', 4000) ?? 4000;
    const gatewayOrigin = `http://127.0.0.1:${gatewayPort}`;
    this.registry = buildRegistry(gatewayOrigin);
    this.cacheTtlMs = this.envService.getNumber('GATEWAY_DOCS_CACHE_TTL_MS', 8000) ?? 8000;
    this.fetchTimeoutMs =
      this.envService.getNumber('GATEWAY_DOCS_FETCH_TIMEOUT_MS', 6000) ?? 6000;
  }

  listServices(): AggregatedDocsItem[] {
    return this.registry.map(({ name, docsUrl, openapiUrl }) => ({
      name,
      docsUrl,
      openapiUrl,
    }));
  }

  async getOpenApi(serviceName: string, requestId?: string): Promise<unknown> {
    const item = this.getRegistryItem(serviceName);
    const now = Date.now();
    const cached = this.cache.get(serviceName);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const response = await fetch(item.openapiTargetUrl, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BadGatewayException(
          `Failed to fetch "${serviceName}" OpenAPI: HTTP ${response.status}`,
        );
      }
      const payload = rewriteOpenApiForGateway(serviceName, await response.json());
      this.cache.set(serviceName, {
        expiresAt: now + this.cacheTtlMs,
        payload,
      });
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        'docs aggregation fetch failed',
        {
          requestId: requestId ?? '-',
          service: serviceName,
          openapiTargetUrl: item.openapiTargetUrl,
          error: message,
        },
        DocsService.name,
      );
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException(
        `Failed to fetch "${serviceName}" OpenAPI: ${message}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  renderServiceSwaggerPage(serviceName: string): string {
    const item = this.getRegistryItem(serviceName);
    const title = `${item.name} API Docs`;
    const nav = this.listServices()
      .map((service) => {
        const activeClass = service.name === item.name ? ' service-link-active' : '';
        return `<a class="service-link${activeClass}" href="${service.docsUrl}">${escapeHtml(service.name)}</a>`;
      })
      .join('');
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/api/gateway-docs/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
      .topbar-link {
        display: inline-block;
        padding: 10px 16px;
        margin: 12px 12px 0 16px;
        border-radius: 8px;
        border: 1px solid #d4d4d8;
        color: #111827;
        text-decoration: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #fff;
      }
      .topbar-link:hover { background: #f4f4f5; }
      .service-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px 16px 0;
      }
      .service-link {
        display: inline-flex;
        align-items: center;
        min-height: 36px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid #d4d4d8;
        background: #ffffff;
        color: #111827;
        text-decoration: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
      }
      .service-link:hover { background: #f4f4f5; }
      .service-link-active {
        background: #111827;
        border-color: #111827;
        color: #ffffff;
      }
    </style>
  </head>
  <body>
    <div class="service-nav">${nav}</div>
    <div id="swagger-ui"></div>
    <script src="/api/gateway-docs/swagger-ui-bundle.js"></script>
    <script src="/api/gateway-docs/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${item.openapiUrl}",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout",
        docExpansion: "none",
      });
    </script>
  </body>
</html>`;
  }

  renderDocsHomePage(): string {
    const entries = this.listServices()
      .map(
        (item) => `
          <li>
            <strong>${escapeHtml(item.name)}</strong>
            <div><a href="${item.docsUrl}">${item.docsUrl}</a></div>
            <div><a href="${item.openapiUrl}">${item.openapiUrl}</a></div>
          </li>
        `,
      )
      .join('');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; line-height: 1.5; }
      h1 { margin-bottom: 8px; }
      ul { padding-left: 20px; }
      li { margin-bottom: 12px; }
      a { color: #0f5ad4; text-decoration: none; }
      a:hover { text-decoration: underline; }
      code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <p>Unified entry for microservice OpenAPI docs.</p>
    <p>Default Swagger: <a href="/api/docs"><code>/api/docs</code></a></p>
    <p>Service list API: <a href="/api/docs/services"><code>/api/docs/services</code></a></p>
    <ul>${entries}</ul>
  </body>
</html>`;
  }

  private getRegistryItem(serviceName: string): DocsRegistryItem {
    const item = this.registry.find((entry) => entry.name === serviceName);
    if (!item) {
      throw new NotFoundException(
        `Unknown docs service "${serviceName}". Visit /api/docs/services for supported names.`,
      );
    }
    return item;
  }
}

function rewriteOpenApiForGateway(serviceName: string, payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const source = payload as Record<string, unknown>;
  const sourcePaths = source.paths;
  if (!sourcePaths || typeof sourcePaths !== 'object') {
    return payload;
  }

  const rewrittenPaths: OpenApiPaths = {};
  for (const [path, operations] of Object.entries(sourcePaths as OpenApiPaths)) {
    const mappedPath = mapServicePathToGateway(serviceName, path);
    if (!mappedPath) {
      continue;
    }
    const existing = rewrittenPaths[mappedPath];
    rewrittenPaths[mappedPath] = existing
      ? { ...existing, ...operations }
      : { ...operations };
  }

  return {
    ...source,
    paths: rewrittenPaths,
    servers: [{ url: '/' }],
  };
}

function mapServicePathToGateway(serviceName: string, path: string): string | null {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (isInfraPath(normalized)) {
    return null;
  }

  if (serviceName === 'gateway') {
    return normalized;
  }

  return normalized;
}

function isInfraPath(path: string): boolean {
  return (
    path === '/health'
    || path === '/api/docs'
    || path === '/api/docs-json'
    || path === '/api/gateway-docs'
    || path.startsWith('/api/docs/')
    || path.startsWith('/api/gateway-docs/')
  );
}

function buildRegistry(gatewayOrigin: string): DocsRegistryItem[] {
  const names: Array<{ name: string; openapiTargetUrl: string }> = [
    { name: 'gateway', openapiTargetUrl: `${gatewayOrigin}/api/docs-json` },
  ];

  return names.map((item) => ({
    name: item.name,
    docsUrl: `/api/docs/${item.name}`,
    openapiUrl: `/api/docs/openapi/${item.name}`,
    openapiTargetUrl: item.openapiTargetUrl,
  }));
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
