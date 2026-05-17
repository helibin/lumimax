import {
  ensureRabbitMqTopology,
  formatRabbitMqTopologySummary,
} from '@lumimax/mq';
import { loadRuntimeEnv } from '../env/load-env';

loadRuntimeEnv();

async function main(): Promise<void> {
  const status = await ensureRabbitMqTopology(process.env);

  console.log('RabbitMQ topology setup completed.');
  for (const line of formatRabbitMqTopologySummary(
    status,
    process.env.RABBITMQ_USER ?? 'root',
  )) {
    console.log(line);
  }

  if (status.warnings.length > 0) {
    console.warn('RabbitMQ topology setup finished with warnings:');
    for (const warning of status.warnings) {
      console.warn(`- ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
