#!/usr/bin/env bash
set -euo pipefail

MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_PORT:-1883}"
MQTT_PROTOCOL="${MQTT_PROTOCOL:-mqtt}"
MQTT_USERNAME="${MQTT_USERNAME:-}"
MQTT_PASSWORD="${MQTT_PASSWORD:-}"
MQTT_CA="${MQTT_CA:-}"
MQTT_CERT="${MQTT_CERT:-}"
MQTT_KEY="${MQTT_KEY:-}"
DEVICE_ID="${DEVICE_ID:-SN_12345}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD_DIR="${SCRIPT_DIR}/payloads"

MQTT_BASE_OPTS=(-h "${MQTT_HOST}" -p "${MQTT_PORT}")
[[ -n "${MQTT_USERNAME}" ]] && MQTT_BASE_OPTS+=(--username "${MQTT_USERNAME}")
[[ -n "${MQTT_PASSWORD}" ]] && MQTT_BASE_OPTS+=(--password "${MQTT_PASSWORD}")
if [[ "${MQTT_PROTOCOL}" == "mqtts" ]]; then
  MQTT_BASE_OPTS+=(--protocol mqtts)
  [[ -n "${MQTT_CA}" ]] && MQTT_BASE_OPTS+=(--ca "${MQTT_CA}")
  [[ -n "${MQTT_CERT}" ]] && MQTT_BASE_OPTS+=(--cert "${MQTT_CERT}")
  [[ -n "${MQTT_KEY}" ]] && MQTT_BASE_OPTS+=(--key "${MQTT_KEY}")
fi

publish() {
  local topic="$1"
  local payload_file="$2"
  local payload
  payload="$(python3 - <<PY
import json
from pathlib import Path
doc = json.loads(Path("${payload_file}").read_text(encoding="utf-8"))
doc["meta"]["deviceId"] = "${DEVICE_ID}"
print(json.dumps(doc, separators=(",", ":")))
PY
)"
  mqttx pub "${MQTT_BASE_OPTS[@]}" -t "${topic}" -m "${payload}"
}

publish "v1/connect/${DEVICE_ID}/req" "${PAYLOAD_DIR}/connect-register.json"
publish "v1/connect/${DEVICE_ID}/status" "${PAYLOAD_DIR}/heartbeat.json"
publish "v1/event/${DEVICE_ID}/req" "${PAYLOAD_DIR}/upload-token-request.json"
publish "v1/cmd/${DEVICE_ID}/res" "${PAYLOAD_DIR}/ota-accepted.json"
publish "v1/cmd/${DEVICE_ID}/res" "${PAYLOAD_DIR}/ota-progress.json"
publish "v1/cmd/${DEVICE_ID}/res" "${PAYLOAD_DIR}/ota-result.json"

echo "Published all v1 payloads for device ${DEVICE_ID}"
