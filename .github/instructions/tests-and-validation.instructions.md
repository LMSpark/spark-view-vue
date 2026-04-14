---
description: "Use when writing or updating Vitest tests, regression tests, integration tests, or choosing validation commands after SPARK frontend/backend changes. Covers test placement, narrow validation order, Spark test isolation, and known Windows Vitest task noise."
name: "SPARK Tests And Validation Guidelines"
applyTo: "tests/**, packages/**/src/tests/**, **/*.test.ts"
---

# SPARK Tests And Validation Guidelines

Use this instruction when adding or editing tests, or when deciding what validation to run after a code change.

## Put Tests In The Right Place

- Use `tests/**` for root-app integration, cross-package regressions, routing/navigation/permission/protocol alignment, and other workspace-level runtime constraints.
- Keep package-local behavior tests in the owning package test directory, typically `packages/**/src/tests/**`.
- Name tests by behavior or regression target, not by implementation detail.
- If a bug crosses package boundaries, prefer a regression test in `tests/**` rather than duplicating narrow unit tests in multiple packages.

## Validation Order

- First run the cheapest check that can falsify the change you just made.
- Prefer a focused Vitest file or test-name run before full-suite validation.
- Run `pnpm run typecheck` for frontend TypeScript or Vue changes unless the touched slice is test-only.
- Run `pnpm run lint` when shared TS/Vue logic changed or when new code paths were added.
- Run `cd spark-ai-server && mvn test` for backend changes with Spring or API impact.
- Use broader commands such as `pnpm run test:run`, `pnpm run test:packages:run`, or `pnpm run verify` only after the narrow slice is stable.

## Common Commands

- `pnpm run test`
- `pnpm run test:run`
- `pnpm run test -- -t "name"`
- `pnpm run typecheck`
- `pnpm run lint`
- `cd spark-ai-server && mvn test`

## SPARK Test Patterns

- Isolate runtime state. Prefer `Spark.createSystem()` or a fresh registry/plugin setup per test file or per describe block.
- For Vue mount tests, install `Spark.createPlugin()` or explicitly provide the registry/root context expected by the component.
- Capability tests should use `sparkProvide` / `sparkConsume` and assert parent-chain lookup directly.
- Data tests should exercise `DataSet`, `DataView`, and `DataKey` through the real public APIs instead of reimplementing mocks around internal behavior.
- Mock external UI libraries only at the module boundary needed for the test.

## Repo-Specific Defaults

- Prefer regression tests for renderer, DataKey, navigation, permission, CRUD bridge, and protocol alignment issues; this repo relies on those tests to protect runtime contracts.
- When a fix belongs to a package but affects cross-package behavior, add the regression where the behavior is enforced, not only where the code changed.
- Do not add broad snapshot tests when a behavioral assertion is clearer and cheaper to maintain.

## Windows Vitest Note

- On Windows, verbose Vitest task output can occasionally report `EnvironmentTeardownError: Closing rpc while onUserConsoleLog was pending` as task noise.
- If that appears, rerun with `pnpm run test:run` before treating it as a real test failure.
- If the rerun is clean and no `Errors` remain, treat the original verbose-task failure as tooling noise, not a product regression.

## Docs

- `docs/guides/TESTING_BEST_PRACTICES.md` — SPARK testing patterns and examples
- `tests/README.md` — root test scope and placement rules
- `package.json` — canonical validation commands