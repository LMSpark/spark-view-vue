/**
 * 能力系统演示组件注册
 */
import { Spark } from '@spark-view/spark-component'

// 导出业务类型
export type { User } from './types'

// 创建注册器（绑定 glob 模块）
const modules = import.meta.glob('./*.vue')
const register = Spark.createRegister(modules as Record<string, () => Promise<{ default: unknown }>>)

// 直接用路径字符串批量注册（无需重复写 glob）
register.registerAll({
  'user-grid': './UserGrid.vue',
  'user-row': './UserRow.vue',
  'user-field': './UserField.vue'
})
