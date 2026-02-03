// features/spark-ej2/initialize.ts
// SPARK-EJ2 组件初始化

import SparkEJ2Grid from './components/SparkEJ2Grid.vue'
import SparkEJ2Column from './components/SparkEJ2Column.vue'
import type { ComponentManager as ISparkComponentManager } from '@spark-view/spark-component'

/**
 * 初始化 SPARK-EJ2 组件
 * 将 EJ2 Grid 和 Column 组件注册到 SPARK 系统
 */
export async function initializeSparkEJ2Components(manager: ISparkComponentManager): Promise<void> {
  const m = manager

  // 注册 SPARK EJ2 Grid 组件
  m.registerComponent({
    type: 'spark-ej2-grid',
    name: 'Spark EJ2 Grid',
    version: '1.0.0',
    component: SparkEJ2Grid,
    providers: [
      {
        name: 'column-manager',
        version: '1.0.0',
        interface: {},
        implementation: {}
      }
    ]
  })

  // 注册 SPARK EJ2 Column 组件
  m.registerComponent({
    type: 'spark-ej2-column',
    name: 'Spark EJ2 Column',
    version: '1.0.0',
    component: SparkEJ2Column,
    consumers: [
      {
        capabilityName: 'column-manager',
        minVersion: '1.0.0',
        interface: {},
        implementation: {}
      }
    ]
  })
}
