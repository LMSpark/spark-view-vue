// features/spark/initialize.ts
// 应用层组件初始化

import SparkEJ2Grid from './components/ej2/SparkEJ2Grid.vue'
import SparkEJ2Column from './components/ej2/SparkEJ2Column.vue'

/**
 * 初始化应用特定的SPARK组件
 */
import type { ComponentManager as ISparkComponentManager } from '../../packages/spark-core/src/types/spark-component'

export async function initializeAppSparkComponents(manager: ISparkComponentManager): Promise<void> {
  const m = manager

  // 注册应用级组件到传入的 manager（显式注入为必需）
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