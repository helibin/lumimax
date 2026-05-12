import type { IdentifyFoodInput } from '../../interfaces/provider.contracts';
import type { DietProviderHttpClient } from '../provider-http.client';

export async function resolveVisionImage(
  httpClient: DietProviderHttpClient,
  input: IdentifyFoodInput,
  timeoutMs: number,
): Promise<{ contentType: string; base64: string; dataUrl: string }> {
  if (input.imageBase64?.trim()) {
    const contentType = 'image/jpeg';
    const base64 = input.imageBase64.trim();
    return {
      contentType,
      base64,
      dataUrl: `data:${contentType};base64,${base64}`,
    };
  }

  if (input.imageUrl?.trim()) {
    if (input.imageUrl.startsWith('data:image/')) {
      const parsed = parseDataUrl(input.imageUrl);
      return {
        ...parsed,
        dataUrl: input.imageUrl,
      };
    }

    const image = await httpClient.getBinary({
      url: input.imageUrl,
      timeoutMs,
      requestId: input.requestId,
    });

    return {
      ...image,
      dataUrl: `data:${image.contentType};base64,${image.base64}`,
    };
  }

  throw new Error('必须提供 imageUrl 或 imageBase64');
}

function parseDataUrl(value: string): { contentType: string; base64: string } {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('非法的 data:image 图片地址');
  }
  return {
    contentType: match[1],
    base64: match[2],
  };
}
