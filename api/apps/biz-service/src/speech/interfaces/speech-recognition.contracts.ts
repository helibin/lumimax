export interface TranscribeSpeechInput {
  audioUrl?: string;
  audioKey?: string;
  audioBase64?: string;
  contentType?: string;
  locale?: string;
  market?: string;
  requestId: string;
}

export interface TranscribeSpeechResult {
  text: string;
  confidence?: number;
  providerCode: string;
  language?: string;
  durationMs?: number;
  raw?: Record<string, unknown>;
}

export interface SpeechRecognitionProvider {
  readonly code: string;
  isEnabled(): boolean;
  getStatus(): SpeechProviderStatus;
  transcribe(input: TranscribeSpeechInput): Promise<TranscribeSpeechResult>;
}

export interface SpeechProviderStatus {
  code: string;
  enabled: boolean;
  reason?: string;
}
