import assert from 'node:assert/strict';
import test from 'node:test';
import { ThirdPartyAvailabilityService } from './third-party-availability.service';

test('startup third-party availability report becomes degraded when probe fails', async () => {
  process.env.STARTUP_THIRD_PARTY_CHECK_ENABLED = 'true';
  process.env.STARTUP_THIRD_PARTY_CHECK_STRICT = 'false';
  process.env.STARTUP_THIRD_PARTY_CHECK_TIMEOUT_MS = '50';
  process.env.LLM_VISION_PROVIDER = 'gemini';
  process.env.LLM_NUTRITION_PROVIDER = 'openai';
  process.env.LLM_VISION_BASE_URL = 'https://gemini.example.com/v1beta';
  process.env.LLM_NUTRITION_BASE_URL = 'https://openai.example.com/v1';
  process.env.OPEN_FOOD_FACTS_BASE_URL = 'https://off.example.com';
  process.env.NUTRITIONIX_APP_ID = '';
  process.env.NUTRITIONIX_API_KEY = '';
  process.env.USDA_FDC_API_KEY = 'demo-usda-key';
  process.env.EDAMAM_APP_ID = 'demo-edamam-id';
  process.env.EDAMAM_API_KEY = 'demo-edamam-key';
  process.env.NUTRITION_DATA_PROVIDERS = 'edamam,usda_fdc,boohee';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.includes('gemini.example.com')) {
      throw new Error('connect timeout');
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;

  try {
    const service = new ThirdPartyAvailabilityService({
      debug() {},
      warn() {},
      error() {},
    } as never);
    await service.onModuleInit();
    const report = service.getReport();
    assert.equal(report.enabled, true);
    assert.equal(report.strict, false);
    assert.equal(report.status, 'degraded');
    assert.deepEqual(
      report.items.map((item) => item.name),
      [
        'llm_vision (gpt-4.1-mini)',
        'boohee (cn realtime slot)',
        'usda_fdc',
        'edamam',
        'llm_nutrition (gpt-4.1-mini)',
      ],
    );
    assert.equal(
      report.items.some(
        (item) => item.name === 'llm_vision (gpt-4.1-mini)' && item.status === 'down',
      ),
      true,
    );
    assert.equal(
      report.items.some(
        (item) => item.name === 'llm_nutrition (gpt-4.1-mini)' && item.status === 'up',
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
