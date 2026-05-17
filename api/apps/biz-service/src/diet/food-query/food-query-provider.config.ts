import { getEnvNumber } from '@lumimax/config';

const DEFAULT_STRONG_CONFIDENCE = 0.99;
const DEFAULT_ANALYZE_NUTRITION_MIN_CONFIDENCE = 0.75;

/** Provider 命中后无需继续拉取下一候选的最低置信度 */
export function getFoodQueryProviderStrongConfidence(): number {
  const value = getEnvNumber('FOOD_QUERY_PROVIDER_STRONG_CONFIDENCE', DEFAULT_STRONG_CONFIDENCE);
  return Math.max(0.5, Math.min(0.99, value));
}

/** Analyze 阶段图片识别达到该置信度后，才继续查询营养数据。 */
export function getFoodQueryAnalyzeNutritionMinConfidence(): number {
  const value = getEnvNumber(
    'FOOD_QUERY_ANALYZE_NUTRITION_MIN_CONFIDENCE',
    DEFAULT_ANALYZE_NUTRITION_MIN_CONFIDENCE,
  );
  return Math.max(0, Math.min(1, value));
}
