import type { INestApplication } from '@nestjs/common';
import { getEnvNumber } from '@lumimax/config';
import { SwaggerModule } from '@nestjs/swagger';
import type { SwaggerSetupOptions } from './swagger.config';
import { createSwaggerConfig } from './swagger.config';

const SWAGGER_THEME_CSS = `
body.theme-dark,
body.theme-dark .swagger-ui,
body.theme-dark .swagger-ui .scheme-container {
  background: #0f172a;
  color: #e2e8f0;
}

body.theme-dark .swagger-ui .topbar {
  background: #111827;
  border-bottom: 1px solid #334155;
}

body.theme-dark .swagger-ui .info .title,
body.theme-dark .swagger-ui .info p,
body.theme-dark .swagger-ui .info li,
body.theme-dark .swagger-ui .info a,
body.theme-dark .swagger-ui .opblock-tag,
body.theme-dark .swagger-ui .opblock-summary-description,
body.theme-dark .swagger-ui .opblock-description-wrapper p,
body.theme-dark .swagger-ui .model,
body.theme-dark .swagger-ui .model-title,
body.theme-dark .swagger-ui table thead tr th,
body.theme-dark .swagger-ui table tbody tr td,
body.theme-dark .swagger-ui .parameter__name,
body.theme-dark .swagger-ui .parameter__type,
body.theme-dark .swagger-ui .response-col_status,
body.theme-dark .swagger-ui .response-col_description {
  color: #e2e8f0;
}

body.theme-dark .swagger-ui .opblock {
  border-color: #334155;
  background: #0b1220;
}

body.theme-dark .swagger-ui .opblock .opblock-section-header,
body.theme-dark .swagger-ui .responses-inner,
body.theme-dark .swagger-ui .opblock .opblock-summary {
  background: #111827;
  border-color: #334155;
}

body.theme-dark .swagger-ui .btn,
body.theme-dark .swagger-ui input,
body.theme-dark .swagger-ui textarea,
body.theme-dark .swagger-ui select {
  background: #0b1220;
  color: #e2e8f0;
  border-color: #334155;
}

body.theme-dark .swagger-ui .highlight-code,
body.theme-dark .swagger-ui .microlight {
  background: #0a0f1c;
}
`;

const SWAGGER_THEME_JS = `
(function () {
  var media = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(isDark) {
    if (isDark) {
      document.body.classList.add('theme-dark');
      return;
    }
    document.body.classList.remove('theme-dark');
  }

  applyTheme(media.matches);

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', function (event) {
      applyTheme(event.matches);
    });
    return;
  }

  if (typeof media.addListener === 'function') {
    media.addListener(function (event) {
      applyTheme(event.matches);
    });
  }
})();
`;

export interface SwaggerSetupResult {
  uiPath: string;
  jsonPath: string;
  uiUrl: string;
  jsonUrl: string;
  enabled: boolean;
  error?: string;
}

export function setupSwagger(
  app: INestApplication,
  options: SwaggerSetupOptions & {
    uiPath?: string;
    jsonPath?: string;
  },
): SwaggerSetupResult {
  const uiPath = options.uiPath ?? 'docs';
  const jsonPath = options.jsonPath ?? 'docs-json';
  const port = app.getHttpServer()?.address?.()?.port ?? getEnvNumber('HTTP_PORT', 3000);
  const uiUrl = `http://localhost:${port}/${uiPath}`;
  const jsonUrl = `http://localhost:${port}/${jsonPath}`;

  try {
    const config = createSwaggerConfig(options);
    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup(uiPath, app, document, {
      jsonDocumentUrl: jsonPath,
      customCss: SWAGGER_THEME_CSS,
      customJsStr: SWAGGER_THEME_JS,
    });

    return { uiPath, jsonPath, uiUrl, jsonUrl, enabled: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Keep service startup resilient even if swagger metadata parsing fails.
    console.warn(`[${options.serviceName}] Swagger disabled: ${message}`);
    return {
      uiPath,
      jsonPath,
      uiUrl: 'disabled',
      jsonUrl: 'disabled',
      enabled: false,
      error: message,
    };
  }
}
