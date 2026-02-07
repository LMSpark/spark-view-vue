/**
 * 能力系统演示组件注册
 */
import { Spark } from '@spark-view/spark-component'

// 导出类型定义供组件使用
export type {
  User,
  SelectionCapability,
  RowDataCapability,
  AppServicesCapability,
  AppRouterCapability,
  AppLoggerCapability
} from './types'

// 注册三个级别的演示组件（使用 /src/ 绝对路径确保动态导入正确）
Spark.register({ name: 'UserGrid', path: '/src/components/demo/UserGrid.vue' })
Spark.register({ name: 'UserRow', path: '/src/components/demo/UserRow.vue' })
Spark.register({ name: 'UserField', path: '/src/components/demo/UserField.vue' })
