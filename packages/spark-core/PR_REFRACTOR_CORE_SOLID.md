# PR: refactor(core): SOLID and interface-first refactor

## Summary
This branch (`refactor/core-solid`) begins a breaking-change refactor of `packages/spark-core` to make the package strictly SOLID-compliant and interface-driven. This PR introduces:

- New core public interfaces in `src/types/interfaces.ts` (`IComponentRegistry`, `IComponentManager`, `ICapabilityManager`, `ILogger`, etc.).
- Contract tests `packages/spark-core/tests/contract/interfaces-contract.test.ts` to assert interface shapes.
- `factories.ts` with `createComponentRegistry/createComponentManager` factory functions and `defaultComponentRegistry/defaultComponentManager` convenience singletons.
- Lint rule & test to forbid importing `.vue` or `features/*` into `packages/spark-core`.
- `API.md` updated to clarify core must not include concrete components.

## Motivation
- Enforce clear public boundaries and single responsibility for core runtime.
- Allow dependency injection and easier unit testing.
- Prepare for further refactors (connector separation, DI, plugin manager split).

## Changes
- Added: `src/types/interfaces.ts`
- Added: `src/factories.ts`
- Added: `packages/spark-core/tests/contract/interfaces-contract.test.ts`
- Added: `packages/spark-core/tests/forbiddenImports.test.ts` (previous commit)
- Modified: `src/types/index.ts` to export new interfaces
- Modified: `src/utils/SparkComponentRegistry.ts` to export registry class
- Modified: `src/index.ts` to export factories

## Tests
- Ran `npm run test` locally — all tests pass (50 tests).

## Migration Notes
- Consumers should prefer `createComponentManager()` / `createComponentRegistry()` for new code.
- Existing singletons (`componentManager`, `componentRegistry`) remain available under `utils` exports, but will be deprecated in future PRs.

## Next steps (planned)
1. Replace internal direct uses of singletons with factory-injected instances in `features/*`.
2. Split connectors into separate modules and introduce `ICapabilityConnector` interface + registration DI.
3. Move plugin manager to its own module and add plugin contract tests.

---

Please review and let me know if you'd like me to open the PR on Gitee (I can open the URL for you), or I can try to create it if you provide repository permissions/flow instructions.