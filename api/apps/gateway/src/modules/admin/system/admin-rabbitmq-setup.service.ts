import { Injectable } from '@nestjs/common';
import {
  ensureRabbitMqTopology,
  inspectRabbitMqTopology,
  resolveRabbitMqTopologyProfiles,
  type RabbitMqTopologyStatus,
} from '@lumimax/mq';

@Injectable()
export class AdminRabbitMqSetupService {
  async getStatus(): Promise<RabbitMqTopologyStatus> {
    try {
      return await inspectRabbitMqTopology(process.env);
    } catch (error) {
      return {
        managementUrl: process.env.RABBITMQ_MANAGEMENT_URL ?? 'http://127.0.0.1:15672',
        profiles: resolveRabbitMqTopologyProfiles(process.env).map((profile) => ({
          exchange: {
            name: profile.exchange,
            ready: false,
          },
          extraExchanges: (profile.extraExchanges ?? []).map((item) => ({
            name: item.name,
            ready: false,
          })),
          name: profile.name,
          queues: profile.queues.map((queue) => ({
            name: queue.name,
            ready: false,
          })),
          ready: false,
          vhost: profile.vhost,
          warnings: [],
        })),
        ready: false,
        warnings: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  async setup(): Promise<RabbitMqTopologyStatus> {
    return ensureRabbitMqTopology(process.env);
  }
}
