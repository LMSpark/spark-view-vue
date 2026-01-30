// REMOVED: Global provider registry has been removed in favor of DI-first provider registration via component contexts
// Please migrate existing usage to attach providers to component contexts (via `useSparkComponent` / `componentManager.registerProvider`) or use the manager/plugin injection.

throw new Error("The module 'utils/GlobalProviderRegistry' has been removed. Use context-level providers or the capability manager instead.")
