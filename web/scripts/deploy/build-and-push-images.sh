#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WEB_ROOT=$(cd -- "${SCRIPT_DIR}/../.." && pwd)

REGISTRY_PREFIX="${REGISTRY_PREFIX:-hub.vlb.cn/work}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

readonly ADMIN_CONTAINERS=(
  "lumimax-web-admin"
  "lumimax-admin-web"
)
readonly WWW_CONTAINERS=(
  "lumimax-web-www"
  "lumimax-www-web"
)

readonly ADMIN_IMAGE="${REGISTRY_PREFIX}/lumimax.web-admin:${IMAGE_TAG}"
readonly WWW_IMAGE="${REGISTRY_PREFIX}/lumimax.web-www:${IMAGE_TAG}"

log() {
  printf '[web-build] %s\n' "$*"
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
    "${ADMIN_CONTAINERS[@]}"
    "${WWW_CONTAINERS[@]}"
  )

  local container
  for container in "${containers[@]}"; do
    docker rm -f "${container}" >/dev/null 2>&1 || true
  done
}

remove_old_images() {
  local images=(
    "${ADMIN_IMAGE}"
    "${WWW_IMAGE}"
    "lumimax.web-admin:${IMAGE_TAG}"
    "lumimax.web-www:${IMAGE_TAG}"
  )

  local image
  for image in "${images[@]}"; do
    docker rmi -f "${image}" >/dev/null 2>&1 || true
  done
}

build_image() {
  local image="$1"
  local app_name="$2"

  docker build "${WEB_ROOT}" \
    -f "${WEB_ROOT}/Dockerfile" \
    -t "${image}" \
    --build-arg APP_NAME="${app_name}"
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

  cd "${WEB_ROOT}"

  run_parallel "building web images" \
    "build_image '${ADMIN_IMAGE}' admin" \
    "build_image '${WWW_IMAGE}' www"

  run_parallel "pushing web images" \
    "push_image '${ADMIN_IMAGE}'" \
    "push_image '${WWW_IMAGE}'"

  log "done"
  log "pushed:"
  log "  ${ADMIN_IMAGE}"
  log "  ${WWW_IMAGE}"
}

main "$@"
