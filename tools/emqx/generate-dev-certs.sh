#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/../../docker/emqx/certs"

mkdir -p "${CERT_DIR}"

CA_KEY="${CERT_DIR}/ca.key"
CA_CRT="${CERT_DIR}/ca.crt"
SERVER_KEY="${CERT_DIR}/server.key"
SERVER_CSR="${CERT_DIR}/server.csr"
SERVER_CRT="${CERT_DIR}/server.crt"
DEVICE_KEY="${CERT_DIR}/device.key"
DEVICE_CSR="${CERT_DIR}/device.csr"
DEVICE_CRT="${CERT_DIR}/device.crt"
EXT_FILE="${CERT_DIR}/server.ext"

openssl genrsa -out "${CA_KEY}" 2048
openssl req -x509 -new -nodes -key "${CA_KEY}" -sha256 -days 3650 \
  -out "${CA_CRT}" -subj "/CN=Lumimax EMQX Dev Root CA/O=Lumimax"

cat > "${EXT_FILE}" <<'EOF'
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = emqx
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

openssl genrsa -out "${SERVER_KEY}" 2048
openssl req -new -key "${SERVER_KEY}" -out "${SERVER_CSR}" \
  -subj "/CN=emqx/O=Lumimax"
openssl x509 -req -in "${SERVER_CSR}" -CA "${CA_CRT}" -CAkey "${CA_KEY}" \
  -CAcreateserial -out "${SERVER_CRT}" -days 3650 -sha256 -extfile "${EXT_FILE}"

openssl genrsa -out "${DEVICE_KEY}" 2048
openssl req -new -key "${DEVICE_KEY}" -out "${DEVICE_CSR}" \
  -subj "/CN=SN_12345/OU=SN_12345/O=Lumimax"
openssl x509 -req -in "${DEVICE_CSR}" -CA "${CA_CRT}" -CAkey "${CA_KEY}" \
  -CAcreateserial -out "${DEVICE_CRT}" -days 3650 -sha256

rm -f "${SERVER_CSR}" "${DEVICE_CSR}" "${EXT_FILE}" "${CERT_DIR}/ca.srl"

cat <<EOF
Generated development certificates in:
  ${CERT_DIR}

Files:
  ca.crt / ca.key
  server.crt / server.key
  device.crt / device.key
EOF
