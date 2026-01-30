# Changelog — packages/spark-core

## [Unreleased]

### Changed
- Use `semver` library for provider version compatibility checks in `SparkComponentRegistry` (replaces naive semver comparison). ✅
- Added tests for semver ranges and prerelease handling (`componentRegistry.findCompatible.test.ts`). ✅
- Added comprehensive `API.md` documenting public API, usage examples, and cleanup suggestions. ✅

### Notes
- This change adds `semver` as a dev dependency (added to the monorepo). If you publish the package separately, ensure `semver` is added to the package's dependencies as appropriate.
