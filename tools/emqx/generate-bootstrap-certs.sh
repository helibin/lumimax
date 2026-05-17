#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="${CERT_DIR:-${SCRIPT_DIR}/../../docker/emqx/certs}"

CA_NAME="${CA_NAME:-Lumimax EMQX Bootstrap Root CA}"
CA_DAYS="${CA_DAYS:-3650}"
LEAF_DAYS="${LEAF_DAYS:-825}"

SERVER_CN="${SERVER_CN:-emqx}"
SERVER_ORG="${SERVER_ORG:-Lumimax}"
SERVER_SANS="${SERVER_SANS:-DNS:emqx,DNS:localhost,IP:127.0.0.1}"

IOT_SERVICE_CN="${IOT_SERVICE_CN:-lumimax_iot}"
IOT_SERVICE_ORG="${IOT_SERVICE_ORG:-Lumimax}"

DEVICE_ID="${DEVICE_ID:-}"
DEVICE_ORG="${DEVICE_ORG:-Lumimax}"

CA_KEY="${CERT_DIR}/ca.key"
CA_CRT="${CERT_DIR}/ca.crt"
SERVER_KEY="${CERT_DIR}/server.key"
SERVER_CSR="${CERT_DIR}/server.csr"
SERVER_CRT="${CERT_DIR}/server.crt"
IOT_SERVICE_KEY="${CERT_DIR}/iot-service.key"
IOT_SERVICE_CSR="${CERT_DIR}/iot-service.csr"
IOT_SERVICE_CRT="${CERT_DIR}/iot-service.crt"
SERVER_EXT="${CERT_DIR}/server.ext"
CLIENT_EXT="${CERT_DIR}/client.ext"

mkdir -p "${CERT_DIR}"
umask 077

log() {
  printf '[emqx-certs] %s\n' "$*"
}

write_server_ext() {
  local alt_names="${1}"
  {
    printf 'authorityKeyIdentifier=keyid,issuer\n'
    printf 'basicConstraints=CA:FALSE\n'
    printf 'keyUsage=digitalSignature,keyEncipherment\n'
    printf 'extendedKeyUsage=serverAuth\n'
    printf 'subjectAltName=%s\n' "${alt_names}"
  } > "${SERVER_EXT}"
}

write_client_ext() {
  {
    printf 'authorityKeyIdentifier=keyid,issuer\n'
    printf 'basicConstraints=CA:FALSE\n'
    printf 'keyUsage=digitalSignature,keyEncipherment\n'
    printf 'extendedKeyUsage=clientAuth\n'
  } > "${CLIENT_EXT}"
}

ensure_ca() {
  if [[ -s "${CA_KEY}" && -s "${CA_CRT}" ]]; then
    log "reuse existing CA: ${CA_CRT}"
    return
  fi
  log "generate CA"
  openssl genrsa -out "${CA_KEY}" 4096
  openssl req -x509 -new -nodes -key "${CA_KEY}" -sha256 -days "${CA_DAYS}" \
    -out "${CA_CRT}" -subj "/CN=${CA_NAME}/O=Lumimax"
}

issue_leaf() {
  local key_path="${1}"
  local csr_path="${2}"
  local crt_path="${3}"
  local subject="${4}"
  local ext_path="${5}"
  local days="${6}"

  if [[ -s "${key_path}" && -s "${crt_path}" ]]; then
    log "reuse existing leaf: ${crt_path}"
    return
  fi

  openssl genrsa -out "${key_path}" 2048
  openssl req -new -key "${key_path}" -out "${csr_path}" -subj "${subject}"
  openssl x509 -req -in "${csr_path}" -CA "${CA_CRT}" -CAkey "${CA_KEY}" \
    -CAcreateserial -out "${crt_path}" -days "${days}" -sha256 -extfile "${ext_path}"
  rm -f "${csr_path}" "${CERT_DIR}/ca.srl"
}

issue_device_if_requested() {
  if [[ -z "${DEVICE_ID}" ]]; then
    return
  fi
  local device_key="${CERT_DIR}/${DEVICE_ID}.key"
  local device_csr="${CERT_DIR}/${DEVICE_ID}.csr"
  local device_crt="${CERT_DIR}/${DEVICE_ID}.crt"
  log "issue device certificate for ${DEVICE_ID}"
  issue_leaf \
    "${device_key}" \
    "${device_csr}" \
    "${device_crt}" \
    "/CN=${DEVICE_ID}/OU=${DEVICE_ID}/O=${DEVICE_ORG}" \
    "${CLIENT_EXT}" \
    "${LEAF_DAYS}"
}

ensure_ca
write_server_ext "${SERVER_SANS}"
write_client_ext

log "ensure EMQX server certificate"
issue_leaf \
  "${SERVER_KEY}" \
  "${SERVER_CSR}" \
  "${SERVER_CRT}" \
  "/CN=${SERVER_CN}/O=${SERVER_ORG}" \
  "${SERVER_EXT}" \
  "${LEAF_DAYS}"

log "ensure iot-service client certificate"
issue_leaf \
  "${IOT_SERVICE_KEY}" \
  "${IOT_SERVICE_CSR}" \
  "${IOT_SERVICE_CRT}" \
  "/CN=${IOT_SERVICE_CN}/OU=internal-service/O=${IOT_SERVICE_ORG}" \
  "${CLIENT_EXT}" \
  "${LEAF_DAYS}"

issue_device_if_requested
rm -f "${SERVER_EXT}" "${CLIENT_EXT}"

cat <<EOF
Bootstrap certificates are ready in:
  ${CERT_DIR}

Generated or reused:
  ca.crt / ca.key
  server.crt / server.key
  iot-service.crt / iot-service.key
EOF

if [[ -n "${DEVICE_ID}" ]]; then
  cat <<EOF
  ${DEVICE_ID}.crt / ${DEVICE_ID}.key
EOF
fi

cat <<EOF

Suggested env:
  EMQX_ROOT_CA_PEM_PATH=/app/certs/emqx/ca.crt
  EMQX_MQTT_CLIENT_CERT_PEM_PATH=/app/certs/emqx/iot-service.crt
  EMQX_MQTT_CLIENT_KEY_PEM_PATH=/app/certs/emqx/iot-service.key
EOF
