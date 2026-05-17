import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolveRabbitMqTopologyCatalog } from '@lumimax/config';
import { RabbitMQModule } from '@lumimax/mq';

@Module({
  imports: [
    RabbitMQModule.forRoot({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (_configService: ConfigService) => {
        const rabbitmqCatalog = resolveRabbitMqTopologyCatalog(process.env);
        return {
          url: rabbitmqCatalog.broker.urlIot!,
          exchange: rabbitmqCatalog.broker.exchange,
          exchangeType: rabbitmqCatalog.broker.exchangeType,
          queue: rabbitmqCatalog.queues.iotQueue,
        };
      },
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitMQIotTransportModule {}
