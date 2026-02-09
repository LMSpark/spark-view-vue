/**
 * 能力系统演示组件注册
 */
import { Spark } from '@spark-view/spark-component'

// 直接使用动态导入函数注册（无需 glob，更简洁！）
Spark.registerAll({
  'user-grid': () => import('./UserGrid.vue'),
  'user-row': () => import('./UserRow.vue'),
  'user-field': () => import('./UserField.vue')
})
