/**
 * Prefix for MQTT client ids used by iot-service when consuming EMQX shared subscriptions
 * and publishing downlink through MQTT. EMQX HTTP auth/ACL must recognize this identity.
 */
export const LUMIMAX_BROKER_DOWNLINK_CLIENT_ID_PREFIX = 'lumimax-iot-service-';

export function isBrokerDownlinkClientId(clientId: string): boolean {
  return clientId.startsWith(LUMIMAX_BROKER_DOWNLINK_CLIENT_ID_PREFIX);
}
