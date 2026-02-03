# @spark-view/spark-component (local)

This package contains the core runtime and utilities used by the SPARK projects.

What moved here

- Shared utilities (previously under `shared/utils`) have been migrated into this package to provide a single source-of-truth for core helpers:
  - Async utilities: `asyncUtils`, `RaceController`
  - Configuration: `ConfigManager`, `getConfig`, `setConfig`, `clearConfig`
  - Error handling: `ErrorHandler` helpers (`handleError`, `withRetry`, `AppError`, `ErrorType`)
  - Logger helpers: `Logger`, `createConsoleTransport`, `createHttpTransport`, `createMemoryTransport`
  - Provider guidance: Attach providers to component contexts via `useSparkComponent` or `componentManager.registerProvider` (DI-first approach) // global registry removed

Usage example (preferred):

```ts
import { Spark } from '@spark-view/spark-component'

// Create manager instances
const manager = Spark.createComponentManager()
const registry = Spark.createComponentRegistry()

// Register components with unified API
Spark.register({
  type: 'my-component',
  name: 'My Component',
  version: '1.0.0',
  component: MyVueComponent
})

// Install in Vue app with explicit DI
const app = createApp(App)
Spark.install(app, { manager, registry })

// Use in components
import { useSparkComponent } from '@spark-view/spark-component'
const { provide, consume } = useSparkComponent({ type: 'my-component' })
```

Quick commands (run from repo root or package dir):

- pnpm -C packages/spark-core run typecheck  # run TypeScript typecheck
- pnpm -C packages/spark-core run test       # run unit tests (Vitest)
- pnpm -C packages/spark-core run build      # build package (tsc)

This package is currently built from compiled artifacts copied from the form-create-ssr-app source. We are migrating source files into `packages/spark-core/src` and adding CI to validate the package independently.

## API Documentation

A detailed API reference with usage examples, types, and migration guides is available in [`API.md`](./API.md).
