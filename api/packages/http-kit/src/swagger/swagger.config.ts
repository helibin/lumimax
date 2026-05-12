import { DocumentBuilder } from '@nestjs/swagger';

export interface SwaggerSetupOptions {
  serviceName: string;
  title: string;
  description: string;
  version: string;
  bearerAuth?: boolean;
}

export function createSwaggerConfig(
  options: SwaggerSetupOptions,
): ReturnType<DocumentBuilder['build']> {
  const builder = new DocumentBuilder()
    .setTitle(options.title)
    .setDescription(options.description)
    .setVersion(options.version);

  if (options.bearerAuth) {
    builder.addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    );
  }

  return builder.build();
}
