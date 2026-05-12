# EMQX Medium Plan Master

## Goal

Build a medium-complexity EMQX integration plan that replaces the AWS IoT Core access layer while staying compatible with the current Lumimax repository constraints.

## Important Repository Constraint

The current repo rule in `api/AGENTS.md` keeps the runtime as:

1. `gateway`
2. `base-service`
3. `biz-service`

So this plan uses **three logical backend domains** first, not three immediately separate deployable apps:

1. `device-service` domain -> implemented inside `biz-service/src/device`
2. `pki-service` domain -> implemented inside `biz-service/src/iot/providers/emqx` and related certificate modules
3. `iot-access-service` domain -> implemented inside `biz-service/src/iot`

Later, each domain can be split into an independent microservice with minimal contract churn.

## Multi-Agent Deliverables

- [01-protocol-and-topic-contract.md](/Volumes/dev/workspace/@ai/lumimax/docs/emqx-middle-plan/01-protocol-and-topic-contract.md)
- [02-three-service-architecture-and-sequences.md](/Volumes/dev/workspace/@ai/lumimax/docs/emqx-middle-plan/02-three-service-architecture-and-sequences.md)
- [03-data-model-api-env-checklist.md](/Volumes/dev/workspace/@ai/lumimax/docs/emqx-middle-plan/03-data-model-api-env-checklist.md)

## Execution Shape

### Phase A

Stabilize protocol and EMQX access assumptions:

- device identity
- certificate subject convention
- topic taxonomy
- connect/register and command/ack flow

### Phase B

Refactor current `biz-service` into explicit internal module boundaries:

- `device`
- `iot-access`
- `pki`

### Phase C

Implement the control plane:

- device create
- certificate issue
- certificate rotate
- auth/acl callbacks

### Phase D

Close the loop with telemetry, downlink, and observability.

## Recommended Build Interpretation

To avoid clashing with the current repo rule, implement the "three services" as three internal domains first:

1. `biz-service/src/device` -> `device-service` domain
2. `biz-service/src/iot` -> `iot-access-service` domain
3. `biz-service/src/iot/providers/emqx` plus certificate orchestration -> `pki-service` domain

Keep interfaces stable so they can later move into separate deployables.

## Recommended Multi-Agent Coding Split

### Agent A: Protocol and EMQX ingress

Ownership:

- `apps/biz-service/src/iot/**`
- `internal/contracts/src/iot/**`

Deliver:

- topic contract
- connect/register validation
- authn/authz request mapping
- uplink normalization

### Agent B: Device control plane

Ownership:

- `apps/biz-service/src/device/**`
- related device entities/migrations

Deliver:

- device registry
- device bindings
- command records
- certificate state projections

### Agent C: PKI and certificate lifecycle

Ownership:

- `apps/biz-service/src/iot/providers/emqx/**`
- certificate package utilities
- certificate issuance/rotation orchestration

Deliver:

- CSR/sign flow
- cert issue/rotate/revoke
- grace-period handling
- certificate delivery package changes

### Agent D: Gateway and admin APIs

Ownership:

- `apps/gateway/src/modules/devices/**`

Deliver:

- admin create/list/detail/freeze/retire APIs
- certificate rotate endpoints
- consistent request/response shapes

## Suggested Delivery Order

1. Protocol/topic contract freeze
2. DB schema and entities
3. EMQX auth/acl callbacks
4. Device create and first certificate issue
5. Telemetry ingest and command downlink
6. Certificate rotate and grace handling
7. Audit and observability

## Immediate Output

This directory is intended to become the handoff package for parallel engineering:

- protocol owner
- access/EMQX owner
- backend/control-plane owner

## Open Repo-Aware Decision

Before cutting code, choose one of these two paths explicitly:

1. **Module-first**
   Keep all new work inside `biz-service`, with stable internal interfaces that mimic future services.
2. **Service-first**
   Break the repo rule and add new deployable services now.

For this repository, the recommended path is **module-first**.
