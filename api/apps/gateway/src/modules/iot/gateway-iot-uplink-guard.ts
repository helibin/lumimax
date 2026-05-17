import { shouldRejectEmqxHttpStyleUplinkIngest } from '@lumimax/config';
import { createIotEmqxQueueHttpIngestDisabledException } from '@lumimax/contracts';

/** Blocks gateway HTTP uplink when EMQX + mq mode (RabbitMQ bridge only). */
export function assertGatewayIotHttpUplinkIngestAllowed(): void {
  if (shouldRejectEmqxHttpStyleUplinkIngest()) {
    throw createIotEmqxQueueHttpIngestDisabledException();
  }
}
