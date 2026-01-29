declare module '@spark-view/spark-core' {
  export const Spark: any
  export function useSparkComponent(...args: any[]): any
  export function initializeSparkComponents(...args: any[]): any
  export function registerSparkComponents(...args: any[]): any
  export function registerSparkComponent(...args: any[]): any
  export function getLogger(...args: any[]): any
  export function getGlobalSparkComponentManager(...args: any[]): any
  export function getGlobalCapabilityManager(...args: any[]): any
  export type SparkComponentConfig = any
  export type SparkComponentContext = any
  export type SparkCapabilityProvider = any
  export type SparkCapabilityConsumer = any
  export type SparkEJ2GridConfig = any
  export type ComponentConfig = any
  export default Spark
}