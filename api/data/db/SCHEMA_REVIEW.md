# Schema Review

Last updated: 2026-04-29

## Device + IoT Model

Current direction has been simplified to:

- `devices`: business primary table
- `devices_iot`: one-to-one IoT extension table

This replaces the earlier split where cloud attachment details and bridge-side device state were spread across multiple legacy tables.

## Current Responsibilities

### `devices`

Business-facing device record:

- tenant and owner scope
- SN and device naming
- device type / product code
- business status
- generic metadata

### `devices_iot`

IoT-facing one-to-one extension:

- vendor
- cloud device id / thing name / product key
- endpoint and provider-side references
- protocol / hardware / firmware snapshots
- activation and sync timestamps
- state snapshot

## Migration Direction

For existing databases:

1. create `devices_iot`
2. backfill from legacy device-cloud / bridge tables
3. switch runtime code to `devices_iot`
4. retire legacy tables after verification

## Status

Runtime code for `device-service` and `iot-bridge-service` now targets `devices_iot`.

Legacy tables may still exist in old databases for rollback safety, but they are no longer the target schema direction.
