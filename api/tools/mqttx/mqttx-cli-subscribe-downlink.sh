#!/usr/bin/env bash
set -euo pipefail

MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_PORT:-1883}"
MQTT_PROTOCOL="${MQTT_PROTOCOL:-mqtt}"
MQTT_CA="${MQTT_CA:-}"
MQTT_CERT="${MQTT_CERT:-}"
MQTT_KEY="${MQTT_KEY:-}"
DEVICE_ID="${DEVICE_ID:-SN_12345}"

MQTT_BASE_OPTS=(-h "${MQTT_HOST}" -p "${MQTT_PORT}")
if [[ "${MQTT_PROTOCOL}" == "mqtts" ]]; then
  MQTT_BASE_OPTS+=(--protocol mqtts)
  [[ -n "${MQTT_CA}" ]] && MQTT_BASE_OPTS+=(--ca "${MQTT_CA}")
  [[ -n "${MQTT_CERT}" ]] && MQTT_BASE_OPTS+=(--cert "${MQTT_CERT}")
  [[ -n "${MQTT_KEY}" ]] && MQTT_BASE_OPTS+=(--key "${MQTT_KEY}")
fi

mqttx sub "${MQTT_BASE_OPTS[@]}" -t "v1/+/${DEVICE_ID}/res" -v

