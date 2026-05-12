import { Transform } from 'class-transformer';
import { parseDateInput } from './date.util';

export function ToDate() {
  return Transform(({ value }) => parseDateInput(value));
}
