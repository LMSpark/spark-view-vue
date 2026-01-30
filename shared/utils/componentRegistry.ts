// Re-export the canonical Spark namespace and provide a helper to access the registry
export { Spark } from '@spark-view/spark-core'

export const getComponentRegistry = (): ReturnType<typeof import('@spark-view/spark-core').Spark.registry> => {
  return (import('@spark-view/spark-core').Spark.registry as any)()
} 
