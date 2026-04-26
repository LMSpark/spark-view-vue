# Capability System Migration Status

Scope: move capability system ownership from `@spark-view/spark-utils` to `@spark-view/spark-component`, enforce symbol keys, and remove cross-package dependency on capability-layer types.

## Completed

- Capability core moved to `spark-component`:
  - `packages/spark-component/src/core/capability-system.ts`
  - exports wired via:
    - `packages/spark-component/src/core/index.ts`
    - `packages/spark-component/src/index.ts`
    - `packages/spark-component/src/components/internal.ts`
- Host semantics capabilityized in renderer/component path:
  - `HOST_FIELD_MODE`, `ACTION_CAPABILITY`
  - relation-only host link (`HostLink`)
- `spark-component` source/tests switched to consume capability APIs from `spark-component` exports (not `spark-utils` capability entry).
- `spark-data` removed dependency on `IAppServicesCapability` and `IEventEmitter` from `spark-utils` capability layer:
  - local `DataSetAppServices`
  - local event emitter + local `IEventEmitter` interface
- `spark-app` theme capability types localized:
  - local `IThemeCapability` / `ThemeMode` in `packages/spark-app/src/theme/index.ts`

## Hard Cutover (No Compatibility)

- `packages/spark-utils/src/capability.ts` has been removed.
- `packages/spark-utils/src/index.ts` no longer re-exports capability symbols/types/functions.
- Capability ownership is now single-source in `@spark-view/spark-component`.

## Verification Snapshot

- Typecheck: `pnpm run typecheck` passes.
- Focused regression tests (root `tests/**`) pass for host/capability-affected flows.

## Follow-up Tasks

1. Replace remaining historical references in comments/docs/examples to prefer `@spark-view/spark-component` capability exports.
2. Add CI rule to fail if capability symbols are imported from `@spark-view/spark-utils`.

## Import Policy (Current)

- Allowed from `@spark-view/spark-utils`:
  - logger/http/error/nav/sandbox/snapshot utilities.
- Disallowed from `@spark-view/spark-utils`:
  - capability keys, capability types, `defineCapability`, `sparkProvide`, `sparkConsume`, `createEventEmitter` as capability infrastructure.
- Required for new capability usage:
  - import from `@spark-view/spark-component`.
