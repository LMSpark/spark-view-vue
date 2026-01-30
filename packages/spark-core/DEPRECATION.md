Deprecation: `utils/componentRegistry` shim removed

What changed
- The legacy shim `packages/spark-core/src/utils/componentRegistry.ts` has been removed.
- The canonical registry implementation is now `packages/spark-core/src/utils/SparkComponentRegistry.ts` and should be imported directly.

Migration
- Replace any imports of the old shim, e.g.:
  import { componentRegistry } from '../utils/componentRegistry'
  
  with:
  import { componentRegistry } from '../utils/SparkComponentRegistry'

Rationale
- Eliminates duplicate registry implementations and ambiguity.
- Encourages a single source of truth for component metadata and avoids subtle bugs.

Timeline
- The shim has been replaced with an explicit error module to surface remaining usages immediately.
- The file will be deleted from the repo in the next release if no further references remain.