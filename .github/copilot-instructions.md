# SPARK Component System - AI Coding Agent Instructions

Purpose: help an AI coding agent be productive quickly in this mono-repo: two apps share the same SPARK component architecture (`apps/spark-view` and `apps/form-create-ssr-app`).

## Quick facts ✅
- Dev server: `npm run dev` (Vite, preview on port 5173)
- Build: `npm run build` (runs `vue-tsc` then `vite build`)
- Typecheck: `npm run typecheck` (uses `tsconfig.typecheck.json`)
- Tests: `npm run test` (Vitest, runs `jsdom` + `@vue/test-utils`); `npm run test:contract` for contract tests
- Lint & hooks: `npm run lint`, Husky pre-commit runs `lint` + `typecheck`

## Where to look (high value files) 🔎
- Concepts & guides: `docs/SPARK_ARCHITECTURE.md`, `docs/COMPONENT_DEV_GUIDE.md` (detailed workflows and examples)
- Component registry: `shared/utils/componentRegistry.ts`
- Example implementations: `features/spark/components/ej2/SparkEJ2Grid.vue`, `features/spark/components/ej2/SparkEJ2Column.vue`
- Core exports: `packages/spark-core` (or `@spark-view/spark-core`) — use the `Spark` namespace (e.g., `Spark.registerSparkComponent`, `Spark.manager()`), or import specific globals from the package when needed (e.g., `globalSparkComponentManager`).
- Tests: `tests/` (see `capability-late-binding.test.ts`, `provider-listener.test.ts`)

## Key conventions & idioms 📌
- Component `type` values use `kebab-case` (e.g., `spark-ej2-grid`) and are registered via `Spark.registerSparkComponent()`.
- Provide the manager in app entry: `app.provide('sparkManager', Spark.manager())`.
- Prefer DI over globals; tests rely on `global` injection fallback (`global: { provide: { sparkManager: getGlobalSparkComponentManager() } }`).
- Use `useSparkComponent({ config })` inside components to get `{ context, registerProvider, consumeCapability, whenProviderAvailable, getOrCreateNoopProvider, logger }`.

## Capability system specifics 🎯
- Late-binding: `consumeCapability(name)` will register a consumer even when provider isn't present (see `useSparkComponent` implementation).
- To wait for a provider: `await whenProviderAvailable('columnManager')`.
- Use `getOrCreateNoopProvider(name)` for safe defaults in tests or optional capabilities.
- Register providers early in parent `setup()` where possible (see `SparkEJ2Grid.vue` which registers `columnManager`, `dataSource`, `gridInstance`).

## Testing & common pitfalls 🧪
- Test stack: Vitest + @vue/test-utils + jsdom. Mock EJ2 libs (Syncfusion) when asserting rendering behavior.
- Provide `sparkManager` to mount options: `mount(Component, { global: { provide: { sparkManager: Spark.manager() } } })`.
- Watch for provider/consumer timing — prefer registering providers in `setup()` or delay consumption until `onMounted` / `whenProviderAvailable`.

## Integration points
- Syncfusion EJ2 components (custom elements `e-*`): Vite config recognizes `e-*` tags; tests should mock these external libs.
- Element Plus is globally registered; use existing UI components rather than re-registering.

## Quick examples (where to copy patterns) ✂️
- Provider registration: `features/spark/components/ej2/SparkEJ2Grid.vue` → `registerProvider('columnManager', { implementation: { addColumn() { ... } } })`
- Consumer + late-binding test: `tests/capability-late-binding.test.ts`

## Troubleshooting & recipes ⚠️
- Component type not found: Check `features/spark/components/index.ts` and `shared/utils/componentRegistry.ts` — ensure the component is passed to `registerSparkComponents()` and the `type` matches the config.
- Tests failing with manager missing: In tests, provide `sparkManager` explicitly: `mount(MyComp, { global: { provide: { sparkManager: getGlobalSparkComponentManager() } } })` or use `Spark.manager()` helper in tests.
- Capability timing issues: If consumers see "Capability not found", either register provider early in parent `setup()` or use `await whenProviderAvailable('capabilityName')` in consumer code.
- Debugging logs: Use `Logger(context)` or `Spark.Logger()` (context optional), or register a global logger via `registerGlobalProvider('logger', provider)` to capture runtime events.

## SSR & build notes (form-create-ssr-app) 🌐
- SSR compatibility: `vite.config.ts` uses `ssr.noExternal` for `element-plus` and other packages — check `vite.config.ts` when debugging SSR-only failures.
- Custom elements (`e-*`): EJ2 custom elements are recognized by Vite; in SSR or tests stub/mask them if the external package isn't available.

## Testing tips 🧪
- Run a single test: `npm run test -- -t "capability-late-binding"`.
- Mock external EJ2 in tests by stubbing the tags or importing small no-op mocks — examples exist in `tests/` where `SparkEJ2Grid` is mounted with a test `config`.
- Use `getOrCreateNoopProvider(name)` in tests to avoid missing provider errors.

---

## Repository re-org notice 🔁
We are simplifying `e:\spark-view` by moving shared/core logic into `packages/spark-core`.
- What moved so far: `shared/utils/componentRegistry.ts` has been re-exported from `@spark-view/spark-core`, and a new package scaffold was created at `packages/spark-core/src`.
- Local TS paths updated to resolve `@spark-view/spark-core` to `./packages/spark-core/src` (see `tsconfig.json`).

Next steps I can do for you (pick one):
1. Move `shared/composables` into `packages/spark-core` and replace with re-exports (recommended next step).
2. Move manager/capability system (`useSparkComponent`, `SparkComponentManager`) into the package and update feature imports.
3. Add build & typecheck steps for the package, CI integration, and tests for package code.

Reply with 1, 2, or 3 to continue.</content>
<parameter name="filePath">e:\form-create-ssr-app\apps\spark-view\.github\copilot-instructions.md