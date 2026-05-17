export const DEVICE_COMMAND_STATUS_PORT = Symbol('DEVICE_COMMAND_STATUS_PORT');

export interface DeviceCommandStatusPort {
  markCommandSent(commandId: string): Promise<unknown>;
  markCommandFailed(commandId: string, reason: string): Promise<unknown>;
}
