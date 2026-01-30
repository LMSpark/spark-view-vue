declare module '@spark-view/spark-core' {
  export const Spark: any
  export function useComponent(...args: any[]): any
  export function useSparkComponent(...args: any[]): any
  export function initializeSparkComponents(...args: any[]): any
  export function Logger(...args: any[]): any
  // Use `Spark.manager()` / `Spark.capabilities()` to retrieve the global managers
  // Prefer using the `Spark` namespace for registration & manager access.
  export type SparkComponentConfig = any
  export type SparkComponentContext = any
  export type SparkCapabilityProvider = any
  export type SparkCapabilityConsumer = any
  export type SparkEJ2GridConfig = any
  export type ComponentConfig = any
  /** Renderer debug provider (mimics best-practice placement in core) */
  export interface RendererDebugProvider {
    componentType: string
    isRegistered: any
    resolvedComponent: any
    childCount: any
  }
  export default Spark
}