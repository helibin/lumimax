import type { DataSource } from 'typeorm';

export async function runMigrations(dataSource: DataSource): Promise<void> {
  await dataSource.runMigrations();
}
