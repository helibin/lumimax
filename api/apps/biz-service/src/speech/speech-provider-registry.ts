import { Injectable } from '@nestjs/common';
import type { SpeechRecognitionProvider } from './interfaces/speech-recognition.contracts';

@Injectable()
export class SpeechProviderRegistry {
  private readonly providers = new Map<string, SpeechRecognitionProvider>();

  register(provider: SpeechRecognitionProvider): void {
    this.providers.set(provider.code, provider);
  }

  get(code: string): SpeechRecognitionProvider | undefined {
    return this.providers.get(code.trim().toLowerCase());
  }

  isEnabled(code: string): boolean {
    return this.providers.get(code.trim().toLowerCase())?.isEnabled() ?? false;
  }

  listStatuses() {
    return [...this.providers.values()].map((provider) => provider.getStatus());
  }
}
