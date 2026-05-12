export function parseDateInput(value: unknown): Date | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  let date: Date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    date = /^\d+$/.test(trimmed)
      ? new Date(Number(trimmed))
      : new Date(trimmed);
  } else {
    return undefined;
  }

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

export function toUtcIso(value?: Date | string | number | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function normalizeEntityTime(entity: {
  createdAt?: Date | string | number | null;
  updatedAt?: Date | string | number | null;
  deletedAt?: Date | string | number | null;
}): {
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
} {
  return {
    createdAt: toUtcIso(entity.createdAt),
    updatedAt: toUtcIso(entity.updatedAt),
    deletedAt: toUtcIso(entity.deletedAt),
  };
}
