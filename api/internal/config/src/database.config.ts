import { registerAs } from '@nestjs/config';

export const databaseConfigToken = 'database';

export interface DatabaseConfigValues {
  dbUrl?: string;
}

export const DatabaseConfig = registerAs(
  databaseConfigToken,
  (): DatabaseConfigValues => ({
    dbUrl: process.env.DB_URL,
  }),
);
