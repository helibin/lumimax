import type { IdentifyFoodInput } from '../../interfaces/provider.contracts';

const VISION_IDENTIFY_RESPONSE_SHAPE =
  '{"imageType":"food_photo","items":[{"name":"","displayName":"","type":"ingredient","confidence":0.0,"count":1,"estimatedWeightGram":0,"children":[]}]}';

export const VISION_IDENTIFY_SYSTEM_PROMPT = [
  'Classify the image and identify visible foods.',
  `Return JSON only as ${VISION_IDENTIFY_RESPONSE_SHAPE}.`,
  'imageType must be one of food_photo, packaged_food_front, nutrition_label, barcode_or_qr, menu_or_receipt, mixed, unknown.',
  'If the image contains packaging, Nutrition Facts, ingredients list, brand/product page, package back label, or barcode/QR, set imageType to packaged_food_front, nutrition_label, or barcode_or_qr as appropriate.',
  'If the main subject is packaged food, use type=packaged_food instead of ingredient.',
  'Each item and child item must include a normalized English name in name. displayName may follow the locale in the image when useful.',
  'Use count for visible discrete units only. Use estimatedWeightGram only when the image strongly supports a rough estimate; otherwise use 0 or omit it.',
  'Use children for mixed meals only when separate visible sub-items can be identified with confidence.',
  'Use confidence from 0 to 1.',
  'Do not wrap JSON in markdown. Do not add explanations.',
].join(' ');

export function buildVisionIdentifyUserPrompt(input: IdentifyFoodInput): string {
  if (input.prompt?.trim()) {
    return input.prompt.trim();
  }
  return [
    'Identify visible foods from this image.',
    'Return JSON only.',
    `locale=${input.locale ?? 'unknown'};`,
    `country=${input.countryCode ?? 'unknown'}.`,
  ].join(' ');
}
