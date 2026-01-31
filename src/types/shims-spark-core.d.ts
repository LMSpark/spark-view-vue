declare module '@spark-view/spark-core' {
  export const Spark: typeof import('@spark-view/spark-core').Spark
  export function useComponent(...args: unknown[]): ReturnType<typeof import('@spark-view/spark-core').useComponent>
  export function useSparkComponent(...args: unknown[]): ReturnType<typeof import('@spark-view/spark-core').useSparkComponent>
  export function initializeSparkComponents(...args: unknown[]): ReturnType<typeof import('@spark-view/spark-core').initializeAppSparkComponents>
  export function Logger(...args: unknown[]): ReturnType<typeof import('@spark-view/spark-core').Logger>
  // Use `Spark.manager()` / `Spark.capabilities()` to retrieve the global managers
  // Prefer using the `Spark` namespace for registration & manager access.
  export type ComponentConfig = import('@spark-view/spark-core').ComponentConfig
  export type ComponentContext = import('@spark-view/spark-core').ComponentContext
  export type CapabilityProvider = import('@spark-view/spark-core').CapabilityProvider
  export type CapabilityConsumer = import('@spark-view/spark-core').CapabilityConsumer
  export type SparkComponentConfig = import('@spark-view/spark-core').ComponentConfig
  export type SparkComponentContext = import('@spark-view/spark-core').ComponentContext
  export type SparkCapabilityProvider = import('@spark-view/spark-core').CapabilityProvider
  export type SparkCapabilityConsumer = import('@spark-view/spark-core').CapabilityConsumer
  /** Renderer debug provider (mimics best-practice placement in core) */
  export interface RendererDebugProvider {
    componentType: string
    isRegistered: boolean
    resolvedComponent: unknown
    childCount: number
  }
  export default Spark
}