export const DEVICE_CLOUD_INBOUND_PORT = Symbol('DEVICE_CLOUD_INBOUND_PORT');

export interface DeviceCloudInboundPort {
  activateFromCloud(body: Record<string, unknown>, requestId: string): Promise<Record<string, unknown>>;
  markOnlineFromCloud(body: Record<string, unknown>, requestId: string): Promise<Record<string, unknown>>;
  markOfflineFromCloud(body: Record<string, unknown>, requestId: string): Promise<Record<string, unknown>>;
  recordHeartbeatTelemetry(
    body: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>>;
  applyAttrResult(body: Record<string, unknown>, requestId: string): Promise<Record<string, unknown>>;
  handleCommandResult(
    body: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>>;
}
