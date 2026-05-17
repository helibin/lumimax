import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../../../diet/providers/provider-http.client';
import type {
  SpeechProviderStatus,
  SpeechRecognitionProvider,
  TranscribeSpeechInput,
  TranscribeSpeechResult,
} from '../../interfaces/speech-recognition.contracts';
import {
  extensionFromContentType,
  inferAudioContentType,
} from '../../speech-audio.util';
import { resolveSpeechAudioBytes } from '../speech-audio-resolve.util';

@Injectable()
export class OpenAiSpeechProvider implements SpeechRecognitionProvider {
  readonly code = 'openai';

  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  isEnabled(): boolean {
    return Boolean(resolveOpenAiApiKey());
  }

  getStatus(): SpeechProviderStatus {
    const apiKey = resolveOpenAiApiKey();
    return {
      code: this.code,
      enabled: Boolean(apiKey),
      reason: apiKey ? undefined : '缺少 SPEECH_OPENAI_AK 或 LLM_VISION_AK',
    };
  }

  async transcribe(input: TranscribeSpeechInput): Promise<TranscribeSpeechResult> {
    const apiKey = resolveOpenAiApiKey();
    if (!apiKey) {
      throw new Error('OpenAI 语音转写需要配置 SPEECH_OPENAI_AK 或 LLM_VISION_AK');
    }

    const startedAt = Date.now();
    const audio = await resolveSpeechAudioBytes(this.httpClient, input);
    const contentType = inferAudioContentType({
      contentType: input.contentType,
      source: input.audioUrl ?? input.audioKey,
    });
    const extension = extensionFromContentType(contentType);
    const model = getEnvString('SPEECH_OPENAI_MODEL', 'gpt-4o-mini-transcribe')!;
    const baseUrl = resolveOpenAiBaseUrl();
    const timeoutMs = getEnvNumber('SPEECH_OPENAI_TIMEOUT_MS', 30000);

    const form = new FormData();
    form.append(
      'file',
      new Blob([copyToArrayBuffer(audio.bytes)], { type: contentType }),
      `audio.${extension}`,
    );
    form.append('model', model);
    if (input.locale?.trim()) {
      form.append('language', normalizeTranscriptionLanguage(input.locale));
    }

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI 语音转写失败: HTTP ${response.status} ${summarizeErrorBody(text)}`);
    }

    const payload = text.trim() ? (JSON.parse(text) as OpenAiTranscriptionResponse) : {};
    const transcript = payload.text?.trim();
    if (!transcript) {
      throw new Error('OpenAI 语音转写返回空文本');
    }

    return {
      text: transcript,
      providerCode: this.code,
      language: payload.language,
      durationMs: Date.now() - startedAt,
      raw: payload as unknown as Record<string, unknown>,
    };
  }
}

interface OpenAiTranscriptionResponse {
  text?: string;
  language?: string;
}

function resolveOpenAiApiKey(): string | undefined {
  const dedicated = getEnvString('SPEECH_OPENAI_AK', '')!.trim();
  if (dedicated) {
    return dedicated;
  }
  const shared = getEnvString('LLM_VISION_AK', '')!.trim();
  return shared || undefined;
}

function resolveOpenAiBaseUrl(): string {
  const dedicated = getEnvString('SPEECH_OPENAI_BASE_URL', '')!.trim();
  if (dedicated) {
    return dedicated.replace(/\/$/, '');
  }
  const shared = getEnvString('LLM_VISION_BASE_URL', 'https://api.openai.com/v1')!.trim();
  return shared.replace(/\/$/, '');
}

function normalizeTranscriptionLanguage(locale: string): string {
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh';
  }
  if (normalized.startsWith('en')) {
    return 'en';
  }
  return normalized.split('-')[0] ?? normalized;
}

function summarizeErrorBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}...` : trimmed;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
