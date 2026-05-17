const AUDIO_EXTENSIONS = new Set([
  'wav',
  'mp3',
  'm4a',
  'aac',
  'ogg',
  'flac',
  'amr',
  'pcm',
  'webm',
]);

const AUDIO_OBJECT_KEY_HINTS = [
  '/audio/',
  '/voice/',
  '/speech/',
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
  '.amr',
  '.webm',
];

/** 设备/App 已上传文本时 target 为识别结果，无需再走 ASR */
export function isLikelyTranscribedText(target: string): boolean {
  const trimmed = target.trim();
  if (!trimmed) {
    return false;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  if (looksLikeAudioObjectKey(trimmed)) {
    return false;
  }
  if (hasAudioFileExtension(trimmed)) {
    return false;
  }
  if (/^[A-Za-z0-9+/=]{200,}$/.test(trimmed)) {
    return false;
  }
  return true;
}

export function looksLikeAudioPayload(input: {
  target?: string;
  audioUrl?: string;
  audioKey?: string;
  audioBase64?: string;
}): boolean {
  if (input.audioUrl?.trim() || input.audioKey?.trim() || input.audioBase64?.trim()) {
    return true;
  }
  const target = input.target?.trim();
  if (!target) {
    return false;
  }
  return !isLikelyTranscribedText(target);
}

function looksLikeAudioObjectKey(value: string): boolean {
  const normalized = value.toLowerCase();
  return AUDIO_OBJECT_KEY_HINTS.some((hint) => normalized.includes(hint));
}

function hasAudioFileExtension(value: string): boolean {
  const extension = value.split('?')[0]?.split('.').pop()?.toLowerCase();
  return Boolean(extension && AUDIO_EXTENSIONS.has(extension));
}

export function inferAudioContentType(input: {
  contentType?: string;
  source?: string;
}): string {
  if (input.contentType?.trim()) {
    return input.contentType.trim();
  }
  const source = input.source?.toLowerCase() ?? '';
  if (source.endsWith('.wav')) {
    return 'audio/wav';
  }
  if (source.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  if (source.endsWith('.m4a')) {
    return 'audio/mp4';
  }
  if (source.endsWith('.ogg')) {
    return 'audio/ogg';
  }
  if (source.endsWith('.webm')) {
    return 'audio/webm';
  }
  return 'audio/mpeg';
}

export function extensionFromContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('wav')) {
    return 'wav';
  }
  if (normalized.includes('mp4') || normalized.includes('m4a')) {
    return 'm4a';
  }
  if (normalized.includes('ogg')) {
    return 'ogg';
  }
  if (normalized.includes('webm')) {
    return 'webm';
  }
  return 'mp3';
}
