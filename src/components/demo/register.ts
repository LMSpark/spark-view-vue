/**
 * 能力系统演示组件注册
 */
import { Spark } from '@spark-view/spark-component'

// 导出类型定义供组件使用
export type {
  User,
  SelectionCapability,
  GridEventsCapability,
  RowDataCapability,
  RowEventsCapability,
  AppServicesCapability,
  AppRouterCapability,
  AppLoggerCapability
} from './types'

// 导出配置工具
export {
  createSimpleConfig,
  createCustomFieldsConfig,
  createReadOnlyConfig,
  createDemoConfig,
  defaultFields,
  type RenderNode,
  type FieldConfig,
  type GridConfig
} from './demo-config'

// 注册三个级别的演示组件

// 1. 模型级组件：UserGrid
Spark.register({
  type: 'user-grid',
  name: 'UserGrid',
  version: '1.0.0',
  loader: () => import('./UserGrid.vue'),
  metadata: {
    level: 'model',
    description: '用户列表 - 模型级组件，管理整体数据和选择',
    capabilities: {
      provides: ['selection', 'gridEvents', 'dataSource'],
      consumes: []
    }
  }
})

// 2. 实例级组件：UserRow
Spark.register({
  type: 'user-row',
  name: 'UserRow',
  loader: () => import('./UserRow.vue'),
  metadata: {
    level: 'instance',
    description: '用户行 - 实例级组件，管理单条数据',
    capabilities: {
      provides: ['rowData', 'rowEvents'],
      consumes: ['selection', 'gridEvents']
    }
  }
})

// 3. 字段级组件：UserField
Spark.register({
  type: 'user-field',
  name: 'UserField',
  loader: () => import('./UserField.vue'),
  metadata: {
    level: 'field',
    description: '用户字段 - 字段级组件，显示单个字段',
    capabilities: {
      provides: [],
      consumes: ['rowData', 'rowEvents']
    }
  }
})

// eslint-disable-next-line no-console
console.log('✅ Capability demo components registered:', {
  'user-grid': 'Model Level (模型级)',
  'user-row': 'Instance Level (实例级)',
  'user-field': 'Field Level (字段级)'
})

// 4. 配置驱动递归渲染器
Spark.register({
  type: 'demo-renderer',
  name: 'DemoRenderer',
  loader: () => import('./DemoRenderer.vue'),
  metadata: {
    description: '递归渲染器 - 根据配置动态渲染组件树',
    capabilities: {
      provides: [],
      consumes: []
    }
  }
})

// 5. 配置驱动演示组件
Spark.register({
  type: 'config-driven-demo',
  name: 'ConfigDrivenDemo',
  loader: () => import('./ConfigDrivenDemo.vue'),
  metadata: {
    description: '配置驱动演示 - 完全由配置文件驱动的组件渲染',
    capabilities: {
      provides: ['appServices'],
      consumes: []
    }
  }
})
