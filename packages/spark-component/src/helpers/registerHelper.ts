/**
 * SPARK 组件注册简化助手
 * 
 * 提供更友好的组件注册 API，自动处理：
 * - 组件类型名称转换（name → kebab-case type）
 * - 懒加载 loader 包装（根据 component 类型自动判断）
 */

import { Logger } from '@spark-view/spark-utils'
import type { ComponentDefinition } from '../types/spark-component.js'

const logger = Logger('Spark:RegisterHelper')

/**
 * 将组件名称转换为 kebab-case 类型
 * 
 * @internal
 * @example
 * 'HeavyGrid' → 'heavy-grid'
 * 'SparkEJ2Grid' → 'spark-ej2-grid'
 * 'MyButton' → 'my-button'
 */
function nameToType(name: string): string {
  return name
    // 在大写字母前插入连字符（但不在开头）
    .replace(/([A-Z])/g, (match, _p1, offset) => 
      offset > 0 ? `-${match.toLowerCase()}` : match.toLowerCase()
    )
    .toLowerCase()
}

/**
 * 简化的组件注册方法
 * 
 * 自动处理类型转换、loader 包装
 * 
 * @param config - 组件配置（path 和 component 互斥）
 *   - { name, path }: 异步加载，path 为字符串路径
 *   - { name, component }: 同步加载，component 为已导入的组件
 * 
 * @example
 * ```typescript
 * // 同步注册
 * Spark.register({ name: 'MyButton', component: MyButtonComponent })
 * 
 * // 异步注册（推荐）
 * Spark.register({ name: 'HeavyGrid', path: './components/HeavyGrid.vue' })
 * 
 * // 批量注册
 * Spark.registerAll([
 *   { name: 'Chart', path: './Chart.vue' },
 *   { name: 'Calendar', component: CalendarComponent }
 * ])
 * ```
 */
export function createSimpleRegistration(
  config: { name: string; path: string } | { name: string; component: unknown }
): ComponentDefinition {
  // 1. 自动生成 type
  const type = nameToType(config.name)
  
  // 2. 根据配置类型判断
  let actualComponent: unknown
  let loader: (() => Promise<{ default: unknown }>) | undefined
  
  if ('path' in config) {
    // 有 path → 创建懒加载 loader
    const componentPath = config.path
    loader = async () => {
      try {
        logger.info(`⏳ Loading component: ${config.name}`)
        const module = await import(/* @vite-ignore */ componentPath)
        const loadedComponent = module.default ?? module
        logger.info(`✅ Loaded component: ${config.name}`)
        return { default: loadedComponent }
      } catch (error) {
        logger.error(`❌ Failed to load component: ${config.name}`, error)
        throw error
      }
    }
  } else {
    // 有 component → 作为已导入的组件
    actualComponent = config.component
  }
  
  // 3. 构建标准配置
  const standardConfig: ComponentDefinition = {
    type,
    name: config.name,
    component: actualComponent,
    loader
  }
  
  return standardConfig
}
