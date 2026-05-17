#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
API_ROOT=$(cd -- "${SCRIPT_DIR}/../.." && pwd)

REGISTRY_PREFIX="${REGISTRY_PREFIX:-hub.vlb.cn/work}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

readonly GATEWAY_CONTAINER="lumimax-gateway"
readonly BASE_CONTAINER="lumimax-base-service"
readonly BIZ_CONTAINER="lumimax-biz-service"
readonly IOT_CONTAINER="lumimax-iot-service"

readonly GATEWAY_IMAGE="${REGISTRY_PREFIX}/lumimax.api-gateway:${IMAGE_TAG}"
readonly BASE_IMAGE="${REGISTRY_PREFIX}/lumimax.api-base:${IMAGE_TAG}"
readonly BIZ_IMAGE="${REGISTRY_PREFIX}/lumimax.api-biz:${IMAGE_TAG}"
readonly IOT_IMAGE="${REGISTRY_PREFIX}/lumimax.api-iot:${IMAGE_TAG}"

log() {
  printf '[api-build] %s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

docker_login() {
  if [[ -n "${HARBOR_USERNAME:-}" && -n "${HARBOR_PASSWORD:-}" ]]; then
    log "logging in to ${REGISTRY_PREFIX%%/*}"
    printf '%s' "${HARBOR_PASSWORD}" | docker login "${REGISTRY_PREFIX%%/*}" -u "${HARBOR_USERNAME}" --password-stdin
  else
    log "skip docker login, using existing local docker credentials"
  fi
}

stop_and_remove_containers() {
  local containers=(
    "${GATEWAY_CONTAINER}"
    "${BASE_CONTAINER}"
    "${BIZ_CONTAINER}"
    "${IOT_CONTAINER}"
  )

  for container in "${containers[@]}"; do
    docker rm -f "${container}" >/dev/null 2>&1 || true
  done
}

remove_old_images() {
  local images=(
    "${GATEWAY_IMAGE}"
    "${BASE_IMAGE}"
    "${BIZ_IMAGE}"
    "${IOT_IMAGE}"
    "lumimax.api-gateway:${IMAGE_TAG}"
    "lumimax.api-base:${IMAGE_TAG}"
    "lumimax.api-biz:${IMAGE_TAG}"
    "lumimax.api-iot:${IMAGE_TAG}"
  )

  for image in "${images[@]}"; do
    docker rmi -f "${image}" >/dev/null 2>&1 || true
  done
}

build_image() {
  local image="$1"
  shift

  docker build "${API_ROOT}" \
    -f "${API_ROOT}/Dockerfile" \
    -t "${image}" \
    "$@"
}

push_image() {
  local image="$1"
  docker push "${image}"
}

run_parallel() {
  local description="$1"
  shift
  local -a pids=()
  local command

  log "${description}"
  for command in "$@"; do
    eval "${command}" &
    pids+=("$!")
  done

  local pid
  for pid in "${pids[@]}"; do
    wait "${pid}"
  done
}

main() {
  require_command docker
  docker_login

  log "stopping and removing local containers"
  stop_and_remove_containers

  log "removing old local images"
  remove_old_images

  cd "${API_ROOT}"

  run_parallel "building api images" \
    "build_image '${GATEWAY_IMAGE}' --build-arg APP_PKG=@lumimax/gateway --build-arg APP_DIR=gateway --build-arg APP_PORT=4000 --build-arg APP_ENTRY=/app/dist/apps/gateway/src/main.js --build-arg APP_WORKDIR=/app/apps/gateway" \
    "build_image '${BASE_IMAGE}' --build-arg APP_PKG=@lumimax/base-service --build-arg APP_DIR=base-service --build-arg APP_PORT=4020 --build-arg APP_ENTRY=/app/dist/apps/base-service/src/main.js --build-arg APP_WORKDIR=/app/apps/base-service" \
    "build_image '${BIZ_IMAGE}' --build-arg APP_PKG=@lumimax/biz-service --build-arg APP_DIR=biz-service --build-arg APP_PORT=4030 --build-arg APP_ENTRY=/app/dist/apps/biz-service/src/main.js --build-arg APP_WORKDIR=/app/apps/biz-service" \
    "build_image '${IOT_IMAGE}' --build-arg APP_PKG=@lumimax/iot-service --build-arg APP_DIR=iot-service --build-arg APP_PORT=4040 --build-arg APP_ENTRY=/app/dist/apps/iot-service/src/main.js --build-arg APP_WORKDIR=/app/apps/iot-service"

  run_parallel "pushing api images" \
    "push_image '${GATEWAY_IMAGE}'" \
    "push_image '${BASE_IMAGE}'" \
    "push_image '${BIZ_IMAGE}'" \
    "push_image '${IOT_IMAGE}'"

  log "done"
  log "pushed:"
  log "  ${GATEWAY_IMAGE}"
  log "  ${BASE_IMAGE}"
  log "  ${BIZ_IMAGE}"
  log "  ${IOT_IMAGE}"
}

main "$@"
