import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceApplicationService } from '../src/device/devices/device-application.service';

function repository<T extends Record<string, any>>(seed: T[] = []) {
  const items: any[] = [...seed];
  return {
    items,
    create(input: T) {
      return { ...input } as T;
    },
    async save(input: any): Promise<any> {
      if (Array.isArray(input)) {
        const results: any[] = [];
        for (const item of input) {
          results.push(await this.save(item));
        }
        return results;
      }
      const entity = {
        createdAt: input.createdAt ?? new Date(),
        updatedAt: new Date(),
        id: input.id ?? `id_${items.length + 1}`,
        ...input,
      } as T;
      const index = items.findIndex((item) => item.id === entity.id);
      if (index >= 0) items[index] = entity;
      else items.push(entity);
      return entity;
    },
    async findOne(input: { where: Record<string, unknown> }) {
      return items.find((item) =>
        Object.entries(input.where).every(([key, value]) => item[key] === value),
      ) ?? null;
    },
    async find(input?: { where?: Record<string, unknown> }) {
      let results = [...items];
      if (input?.where) {
        results = results.filter((item) =>
          Object.entries(input.where!).every(([key, value]) => item[key] === value),
        );
      }
      return results;
    },
    async findAndCount() {
      return [items, items.length] as const;
    },
    createQueryBuilder() {
      return {
        where() { return this; },
        andWhere() { return this; },
        orderBy() { return this; },
        skip() { return this; },
        take() { return this; },
        async getManyAndCount() { return [items, items.length] as const; },
      };
    },
    async softDelete() {
      return;
    },
    async delete() {
      return;
    },
  };
}

test('device command and shadow operations are handled locally', async () => {
  const devices = repository<any>([
    {
      id: '01h0000000000000000000301',
      tenantId: '01h0000000000000000000011',
      deviceSn: 'sn_1',
      productKey: 'smart-scale',
      provider: 'aws',
      status: 'active',
      onlineStatus: 'online',
      boundUserId: '01h0000000000000000000001',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const bindings = repository<any>();
  const commands = repository<any>();
  const credentials = repository<any>();
  const shadows = repository<any>();
  const logs = repository<any>();
  const provisionRecords = repository<any>();
  const meals = repository<any>();
  const recognitionLogs = repository<any>();

  const service = new DeviceApplicationService(
    devices as never,
    commands as never,
    credentials as never,
    shadows as never,
    logs as never,
    provisionRecords as never,
    meals as never,
    recognitionLogs as never,
    {
      appendBinding: async () => undefined,
      closeActiveBinding: async () => undefined,
    } as never,
    {
      async createCommandEntity(input: Record<string, unknown>) {
        return {
          id: '01h0000000000000000000991',
          commandType: input.commandType,
          payloadJson: input.payload ?? {},
          status: 'sent',
        };
      },
      toCommandResult(command: Record<string, unknown>) {
        return command;
      },
    } as never,
    {
      async saveShadow(
        _device: Record<string, unknown>,
        desired: Record<string, unknown>,
      ) {
        return { desired };
      },
    } as never,
    {} as never,
    {
      async publish() {
        return;
      },
    } as never,
    {
      async provisionOnDeviceCreated() {
        return { ok: true };
      },
    } as never,
  );

  const command = await service.execute<Record<string, unknown>>({
    operation: 'devices.command',
    params: { id: '01h0000000000000000000301' },
    body: { commandType: 'reboot', payload: { delaySeconds: 1 } },
    user: { userId: '01h0000000000000000000001', type: 0 },
    tenantScope: '01h0000000000000000000011',
    requestId: '01h0000000000000000000101',
  });
  const shadow = await service.execute<Record<string, unknown>>({
    operation: 'devices.shadow.patch',
    params: { id: '01h0000000000000000000301' },
    body: { desired: { mode: 'eco' } },
    user: { userId: '01h0000000000000000000001', type: 0 },
    tenantScope: '01h0000000000000000000011',
    requestId: '01h0000000000000000000102',
  });

  assert.equal(command.commandType, 'reboot');
  assert.equal(command.status, 'sent');
  assert.deepEqual(shadow.desired, { mode: 'eco' });
});
