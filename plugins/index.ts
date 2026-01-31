// plugins/index.ts
// Vue插件入口文件 - Spark命名空间API


// plugins/index.ts
// 简化：使用 core 提供的 Spark 命名导出以保持单一来源并减少运行时分歧
export { Spark } from '@spark-view/spark-core'

export type { SparkComponentConfig, SparkComponentContext, SparkCapabilityProvider, SparkCapabilityConsumer } from '@spark-view/spark-core'

export default Spark
