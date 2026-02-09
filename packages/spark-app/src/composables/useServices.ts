/**
 * 服务访问 Composables
 * 
 * 📌 DI 架构统一说明：
 * 
 * SPARK 项目采用单一 DI 管道（管道 B - SPARK 能力系统）：
 * - ✅ 推荐：使用 APP_SERVICES 能力获取应用服务
 *   ```ts
 *   const { consume } = useSparkComponent({ type: 'my-comp' })
 *   const services = consume(APP_SERVICES)
 *   services?.router?.push('/home')
 *   services?.logger?.info('Action')
 *   ```
 * 
 * - ✅ Router：直接使用 vue-router
 *   ```ts
 *   import { useRouter } from 'vue-router'
 *   const router = useRouter()
 *   ```
 * 
 * - ✅ Logger：使用工厂函数
 *   ```ts
 *   import { Logger } from '@spark-view/spark-utils'
 *   const logger = Logger('MyModule')
 *   ```
 */

import { inject } from 'vue'
import { SPARK_REGISTRY_KEY } from '../constants'

// 外部类型（从相应包导入）
type SparkRegistry = import('@spark-view/spark-component').ComponentRegistry

// ============================================================================
// 核心基础设施 Composables（仅保留 SPARK 组件系统必需）
// ============================================================================

/**
 * 使用 SPARK 组件注册表
 * 
 * ⚠️ 注意：此为 SPARK 组件系统核心基础设施，保留 Vue DI 机制
 * 
 * @example
 * ```ts
 * const registry = useSparkRegistry()
 * registry.register('my-component', MyComponent)
 * ```
 */
export function useSparkRegistry(): SparkRegistry {
  const registry = inject(SPARK_REGISTRY_KEY) as SparkRegistry
  if (!registry) {
    throw new Error('SparkRegistry not provided. Make sure Spark.createPlugin() is installed.')
  }
  return registry
}
