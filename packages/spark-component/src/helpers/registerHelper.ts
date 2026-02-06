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
 * component 参数可以是：
 * - string：作为路径懒加载
 * - 其他：作为已导入的组件
 * 
 * @param name - 组件名称（自动转换为 kebab-case type）
 * @param component - 字符串路径或组件本身
 * 
 * @example
 * ```typescript
 * // 同步注册 - component 是组件本身
 * Spark.register({ name: 'MyButton', component: MyButtonComponent })
 * 
 * // 异步注册（推荐）- component 是字符串路径
 * Spark.register({ name: 'HeavyGrid', component: './components/HeavyGrid.vue' })
 * 
 * // 批量注册
 * Spark.registerAll([
 *   { name: 'Chart', component: './Chart.vue' },
 *   { name: 'Calendar', component: './Calendar.vue' }
 * ])
 * ```
 */
export function createSimpleRegistration(
  name: string,
  component: string | unknown
): ComponentDefinition {
  // 1. 自动生成 type
  const type = nameToType(name)
  
  // 2. 根据 component 类型智能判断
  let actualComponent: unknown
  let loader: (() => Promise<{ default: unknown }>) | undefined
  
  if (typeof component === 'string') {
    // 字符串 → 作为路径懒加载
    const componentPath = component
    loader = async () => {
      try {
        logger.info(`⏳ Loading component: ${name}`)
        const module = await import(/* @vite-ignore */ componentPath)
        const loadedComponent = module.default ?? module
        logger.info(`✅ Loaded component: ${name}`)
        return { default: loadedComponent }
      } catch (error) {
        logger.error(`❌ Failed to load component: ${name}`, error)
        throw error
      }
    }
  } else {
    // 非字符串 → 作为已导入的组件
    actualComponent = component
  }
  
  // 3. 构建标准配置
  const standardConfig: ComponentDefinition = {
    type,
    name,
    component: actualComponent,
    loader
  }
  
  return standardConfig
}
