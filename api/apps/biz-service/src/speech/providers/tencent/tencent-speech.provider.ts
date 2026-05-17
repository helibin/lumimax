import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../../../diet/providers/provider-http.client';
import type {
  SpeechProviderStatus,
  SpeechRecognitionProvider,
  TranscribeSpeechInput,
  TranscribeSpeechResult,
} from '../../interfaces/speech-recognition.contracts';
import { inferAudioContentType } from '../../speech-audio.util';
import { resolveSpeechAudioBytes } from '../speech-audio-resolve.util';
import { signTencentCloudRequest } from './tencent-cloud-sign.util';

@Injectable()
export class TencentSpeechProvider implements SpeechRecognitionProvider {
  readonly code = 'tencent';

  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  isEnabled(): boolean {
    return hasTencentSpeechConfig();
  }

  getStatus(): SpeechProviderStatus {
    const enabled = hasTencentSpeechConfig();
    return {
      code: this.code,
      enabled,
      reason: enabled
        ? undefined
        : '缺少 TENCENT_SPEECH_SECRET_ID / TENCENT_SPEECH_SECRET_KEY',
    };
  }

  async transcribe(input: TranscribeSpeechInput): Promise<TranscribeSpeechResult> {
    const secretId = getEnvString('TENCENT_SPEECH_SECRET_ID', '')!.trim();
    const secretKey = getEnvString('TENCENT_SPEECH_SECRET_KEY', '')!.trim();
    if (!secretId || !secretKey) {
      throw new Error('腾讯云 ASR 需要配置 TENCENT_SPEECH_SECRET_ID 与 TENCENT_SPEECH_SECRET_KEY');
    }

    const startedAt = Date.now();
    const audio = await resolveSpeechAudioBytes(this.httpClient, input);
    const contentType = inferAudioContentType({
      contentType: input.contentType,
      source: input.audioUrl ?? input.audioKey,
    });
    const voiceFormat = mapVoiceFormat(contentType);
    const engServiceType = resolveEngServiceType(input.locale);
    const region = getEnvString('TENCENT_SPEECH_REGION', 'ap-guangzhou')!.trim();
    const endpoint = getEnvString(
      'TENCENT_SPEECH_ENDPOINT',
      'https://asr.tencentcloudapi.com',
    )!
      .trim();
    const timeoutMs = getEnvNumber('TENCENT_SPEECH_TIMEOUT_MS', 15000);

    const body = {
      ProjectId: Number(getEnvString('TENCENT_SPEECH_PROJECT_ID', '0')),
      SubServiceType: 2,
      EngSerViceType: engServiceType,
      SourceType: 1,
      VoiceFormat: voiceFormat,
      UsrAudioKey: input.requestId.slice(0, 32),
      Data: Buffer.from(audio.bytes).toString('base64'),
      DataLen: audio.bytes.byteLength,
    };

    const signed = signTencentCloudRequest({
      secretId,
      secretKey,
      service: 'asr',
      host: new URL(endpoint).host,
      region,
      action: 'SentenceRecognition',
      version: '2019-06-14',
      payload: body,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`腾讯云 ASR 失败: HTTP ${response.status} ${summarizeErrorBody(text)}`);
    }

    const payload = text.trim() ? (JSON.parse(text) as TencentAsrResponse) : {};
    if (payload.Response?.Error) {
      throw new Error(
        `腾讯云 ASR 失败: ${payload.Response.Error.Code} ${payload.Response.Error.Message}`,
      );
    }

    const transcript = payload.Response?.Result?.trim();
    if (!transcript) {
      throw new Error('腾讯云 ASR 返回空文本');
    }

    return {
      text: transcript,
      providerCode: this.code,
      durationMs: Date.now() - startedAt,
      raw: payload as unknown as Record<string, unknown>,
    };
  }
}

interface TencentAsrResponse {
  Response?: {
    Result?: string;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
}

function hasTencentSpeechConfig(): boolean {
  const secretId = getEnvString('TENCENT_SPEECH_SECRET_ID', '')!.trim();
  const secretKey = getEnvString('TENCENT_SPEECH_SECRET_KEY', '')!.trim();
  return Boolean(secretId && secretKey);
}

function mapVoiceFormat(contentType: string): number {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('wav')) {
    return 12;
  }
  if (normalized.includes('mp3') || normalized.includes('mpeg')) {
    return 8;
  }
  if (normalized.includes('m4a') || normalized.includes('mp4')) {
    return 2;
  }
  if (normalized.includes('ogg')) {
    return 6;
  }
  return 8;
}

function resolveEngServiceType(locale?: string): string {
  const configured = getEnvString('TENCENT_SPEECH_ENGINE', '')!.trim();
  if (configured) {
    return configured;
  }
  const normalized = locale?.trim().toLowerCase() ?? '';
  if (normalized.startsWith('zh')) {
    return '16k_zh';
  }
  return '16k_en';
}

function summarizeErrorBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}...` : trimmed;
}
