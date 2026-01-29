# SPARK Component System - AI Coding Agent Instructions

## Architecture Overview

This is a Vue 3 + TypeScript project implementing the SPARK (Scalable Plugin Architecture for Reactive Components) system - a capability-driven, plugin-based component architecture following SOLID principles. Components are defined by configuration objects and rendered recursively through a capability system.

**Key architectural layers:**
- **Application Layer**: Component configurations (`SparkComponentConfig`)
- **Manager Layer**: Registry, Renderer, Capability Manager
- **Base Layer**: `SparkComponentBase.vue` with lifecycle/context management
- **Capability Layer**: Providers/Consumers with late-binding connections
- **Plugin Layer**: Extensible hooks and built-in plugins

## Essential Developer Workflows

### Component Development
1. Create component in `features/spark/components/` (e.g., `SparkMyFeature.vue`)
2. Use `useSparkComponent(props)` composable for context/capability management
3. Register component via `registerSparkComponent()` in component registry
4. Implement capabilities as providers/consumers with defined interfaces

### Capability System Patterns
- **Late-binding**: `consumeCapability(name)` registers consumer even if provider doesn't exist yet
- **No-op providers**: Use `getOrCreateNoopProvider(name)` to avoid null capability errors
- **Global providers**: Register via `registerGlobalProvider(name, provider)` for app-wide capabilities like logger
- **Async consumption**: Use `whenProviderAvailable(name)` to wait for providers that may register later

### Build & Test Commands
```bash
npm run dev              # Start dev server (port 5173)
npm run build           # Type-check + build with Vite
npm run typecheck       # TypeScript check only
npm run lint            # ESLint with auto-fix
npm run test            # Vitest tests
npm run test:contract   # Contract-specific tests
npm run docs:dev        # VitePress docs server
npm run docs:build      # Build docs
npm run docs:serve      # Serve built docs
npm run bench:create-tree # Run tree creation benchmark
```

### Testing Patterns
- Mock EJ2 components in tests (they're external Syncfusion libraries)
- Provide `sparkManager` in test globals: `global: { provide: { sparkManager: getGlobalSparkComponentManager() } }`
- Test capability registration/consumption and context lifecycle
- Use `vitest` + `@vue/test-utils` + `jsdom` environment
- Mock external dependencies like EJ2 grids/inputs

## Project-Specific Conventions

### Directory Structure
```
features/spark/           # SPARK components & core system
  components/            # Vue components (SparkEJ2Grid.vue, etc.)
  utils/                 # Managers, registry, capabilities
pages/                   # Demo pages
shared/                  # Shared utilities/types
  composables/          # Shared Vue composables
  types/                # TypeScript interfaces
  utils/                # Utility functions
plugins/                 # Plugin system
tests/                   # Unit/integration tests
docs/                   # VitePress documentation
```

### Naming & Patterns
- Component types: `kebab-case` (e.g., `spark-ej2-grid`)
- Import aliases: `@` (current dir), `@features`, `@pages`, `@shared`, `@plugins`, `@root` (parent src)
- Dependency injection: Manager provided as `sparkManager` in `main.ts`
- Logger: Use `getLogger(context)` from composables in components, direct import in utils
- Husky pre-commit hooks: lint and typecheck automatically

### Component Implementation Template
```vue
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-core'

const props = defineProps<{ config: SparkComponentConfig }>()
const { context, registerProvider, consumeCapability, logger } = useSparkComponent({ config: props.config })

// Register capabilities early in setup
registerProvider('myCapability', { /* implementation */ })

// Consume with late-binding
const dependency = consumeCapability('otherCapability')

// Or wait for async provider
const asyncDep = await whenProviderAvailable('otherCapability')
</script>
```

### Key Files to Reference
- `docs/SPARK_ARCHITECTURE.md`: System design and interfaces
- `docs/COMPONENT_DEV_GUIDE.md`: Development workflows and best practices
- `features/spark/index.ts`: Spark namespace API
- `features/spark/initialize.ts`: App-specific component initialization
- `shared/composables/index.ts`: Shared Vue composables
- `tests/spark-component.test.ts`: Testing patterns
- `vite.config.ts`: Build config with EJ2 custom elements

### Integration Points
- **EJ2 Components**: Syncfusion grids/inputs - mock in tests, import on-demand, custom elements with `e-` prefix
- **Element Plus**: UI library, globally registered
- **Vite Config**: Custom element recognition for EJ2 (`e-*` tags), path aliases
- **ESLint**: Shared config from parent directory
- **Husky**: Pre-commit hooks for linting and typechecking

Focus on capability interfaces over direct component coupling. Always register providers before consuming capabilities. Use the logger composable for consistent logging across components and utils.</content>
<parameter name="filePath">e:\form-create-ssr-app\apps\spark-view\.github\copilot-instructions.md