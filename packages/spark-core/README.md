# @spark-view/spark-core (local)

This package contains the core runtime and utilities used by the SPARK projects.

What moved here

- Shared utilities (previously under `shared/utils`) have been migrated into this package to provide a single source-of-truth for core helpers:
  - Async utilities: `asyncUtils`, `RaceController`
  - Configuration: `ConfigManager`, `getConfig`, `setConfig`, `clearConfig`
  - Error handling: `ErrorHandler` helpers (`handleError`, `withRetry`, `AppError`, `ErrorType`)
  - Logger helpers: `Logger`, `createConsoleTransport`, `createHttpTransport`, `createMemoryTransport`
  - Global provider registry: `registerGlobalProvider`, `getGlobalProvider`, `getOrCreateNoopProvider`

Usage example (preferred):

```ts
import { Spark, registerSparkComponent, Logger, asyncUtils } from '@spark-view/spark-core'

// get global manager
const manager = Spark.manager()

// register components
registerSparkComponent({ type: 'my-component', name: 'MyComponent', version: '1.0.0', component: MyVueComponent })

// read global logger
const logger = Spark.Logger()
logger.info('hello')

// async helper
const debounced = asyncUtils.debounce(() => console.log('tick'), 100)
```

Quick commands (run from repo root or package dir):

- pnpm -C packages/spark-core run typecheck  # run TypeScript typecheck
- pnpm -C packages/spark-core run test       # run unit tests (Vitest)
- pnpm -C packages/spark-core run build      # build package (tsc)

This package is currently built from compiled artifacts copied from the form-create-ssr-app source. We are migrating source files into `packages/spark-core/src` and adding CI to validate the package independently.
