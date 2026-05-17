import type { DietProviderHttpClient } from '../../diet/providers/provider-http.client';
import type { TranscribeSpeechInput } from '../interfaces/speech-recognition.contracts';
import { isLikelyTranscribedText } from '../speech-audio.util';

export async function resolveSpeechAudioBytes(
  httpClient: DietProviderHttpClient,
  input: TranscribeSpeechInput,
): Promise<{ bytes: Uint8Array; source: string }> {
  if (input.audioBase64?.trim()) {
    return {
      bytes: Uint8Array.from(Buffer.from(input.audioBase64.trim(), 'base64')),
      source: 'audioBase64',
    };
  }

  const audioUrl = input.audioUrl?.trim();
  if (audioUrl) {
    const binary = await httpClient.getBinary({
      url: audioUrl,
      requestId: input.requestId,
      timeoutMs: 30000,
    });
    return {
      bytes: Uint8Array.from(Buffer.from(binary.base64, 'base64')),
      source: audioUrl,
    };
  }

  const target = input.audioKey?.trim();
  if (target && !isLikelyTranscribedText(target)) {
    throw new Error('audioKey 转写需配合 storage 签名 URL，请传 audioUrl 或 audioBase64');
  }

  throw new Error('缺少可识别的音频输入（audioUrl / audioBase64）');
}
