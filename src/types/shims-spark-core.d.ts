declare module '@spark-view/spark-core' {
  export const Spark: any
  export function useComponent(...args: unknown[]): any
  export function useSparkComponent(...args: unknown[]): any
  export function initializeSparkComponents(...args: unknown[]): any
  export function Logger(...args: unknown[]): any

  export type ComponentConfig = any
  export type ComponentContext = any
  export type CapabilityProvider = any
  export type CapabilityConsumer = any
  export type SparkComponentConfig = any
  export type SparkComponentContext = any
  export type SparkCapabilityProvider = any
  export type SparkCapabilityConsumer = any

  /** Renderer debug provider (mimics best-practice placement in core) */
  export interface RendererDebugProvider {
    componentType: string
    isRegistered: boolean
    resolvedComponent: unknown
    childCount: number
  }

  export default Spark
}