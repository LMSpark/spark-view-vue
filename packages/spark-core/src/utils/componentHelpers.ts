// REMOVED: `getSparkMetaFromComponent` helper deleted to simplify the public API surface and
// centralize Vue component meta handling in `vue/SparkComponentBase` and the `Spark` namespace.
// Migration options:
// - Use `Spark.registerSparkComponentFromComponent(component)` to register components by attached meta
// - Import `SparkComponentMeta` and helpers from `../vue/SparkComponentBase.js`

export function getSparkMetaFromComponent(): never {
  throw new Error('getSparkMetaFromComponent has been removed. Migrate to Spark.registerSparkComponentFromComponent(component) or import SparkComponentMeta from "../vue/SparkComponentBase".')
}