// Re-export the canonical Spark namespace and provide a helper to access the registry
export { Spark } from '@spark-view/spark-core'

import type { ComponentRegistry } from '@spark-view/spark-core'
export const getComponentRegistry = (): ComponentRegistry => {
  return (import('@spark-view/spark-core').Spark.registry as unknown as () => ComponentRegistry)()
} 
