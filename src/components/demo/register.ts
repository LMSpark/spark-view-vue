/**
 * 能力系统演示组件注册
 *
 * 使用 Spark.createRegister + import.meta.glob 批量注册：
 * - Vite 自动感知所有 .vue 文件，支持代码分割（懒加载）
 * - 通过 registerAll 建立 type → 文件路径映射
 */
import { Spark } from '@spark-view/spark-component'
import type { GlobModules } from '@spark-view/spark-component'

const reg = Spark.createRegister(import.meta.glob('./*.vue') as GlobModules)

reg.registerAll({
  'user-grid': './UserGrid.vue',
  'user-row': './UserRow.vue',
  'user-field': './UserField.vue'
})
