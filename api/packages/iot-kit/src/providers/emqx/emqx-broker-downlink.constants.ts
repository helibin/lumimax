/**
 * Prefix for MQTT client ids used by biz-service when publishing downlink to EMQX
 * ({@link EmqxProviderService}). EMQX HTTP auth/ACL must recognize this identity.
 */
export const LUMIMAX_BROKER_DOWNLINK_CLIENT_ID_PREFIX = 'lumimax-';

export function isBrokerDownlinkClientId(clientId: string): boolean {
  return clientId.startsWith(LUMIMAX_BROKER_DOWNLINK_CLIENT_ID_PREFIX);
}
