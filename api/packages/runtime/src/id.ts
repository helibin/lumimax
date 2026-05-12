import { ulid } from 'ulid';

export function generateId(): string {
  return ulid().toLowerCase();
}

export function generateRequestId(): string {
  return generateId();
}
