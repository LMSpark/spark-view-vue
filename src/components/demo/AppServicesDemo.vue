<template>
  <div class="app-services-demo">
    <h2>🎯 APP 服务能力演示（页面层统一提供）</h2>
    
    <div class="info-box">
      <p>✅ 页面层已提供 <code>appServices</code> 能力，子组件无需重复导入</p>
      <p>📦 包含: router, logger, configLoader, authService</p>
    </div>

    <!-- 三层级组件 -->
    <UserGrid :config="gridConfig" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useLogger } from '@spark-view/spark-app'
import { SparkData } from '@spark-view/spark-data'
import type { ComponentConfig } from '@spark-view/spark-component'
import UserGrid from './UserGrid.vue'

// ============ 获取 APP 层服务 ============
const router = useRouter()
const logger = useLogger()
const configLoader = inject('configLoader') as any

// ============ 创建 DataSet ============
const dataSet = SparkData.classes.DataSetManager.create({
    dataSetName: 'AppServicesDemo',
    tables: {
        Users: {
            tableName: 'Users',
            columns: [
                { name: 'id', type: 'number', isPrimaryKey: true },
                { name: 'name', type: 'string' },
                { name: 'age', type: 'number' },
                { name: 'email', type: 'string' },
                { name: 'status', type: 'string' }
            ],
            rows: [
                { id: 1, name: 'Alice', age: 28, email: 'alice@example.com', status: 'active' },
                { id: 2, name: 'Bob', age: 32, email: 'bob@example.com', status: 'active' },
                { id: 3, name: 'Charlie', age: 25, email: 'charlie@example.com', status: 'inactive' }
            ]
        }
    },
    updateRelatedTables: function (_tableName: string): void {
        throw new Error('Function not implemented.')
    },
    notifySubscribers: function (_tableName: string, _contextId?: string): void {
        throw new Error('Function not implemented.')
    },
    emit: function (_event: string, _data: unknown): void {
        throw new Error('Function not implemented.')
    },
    subscribe: function (_tableName: string, _contextId: string, _callback: () => void): void {
        throw new Error('Function not implemented.')
    },
    on: function (_event: string, _handler: Function): void {
        throw new Error('Function not implemented.')
    },
    off: function (_event: string, _handler: Function): void {
        throw new Error('Function not implemented.')
    }
})

// ============ 创建能力管理器，注入 APP 服务 ============
const capabilityManager = SparkData.createCapabilityManager('app-services-demo', {
  dataSet,
  
  // 🎯 关键：在页面层注入 APP 服务
  appServices: {
    router: {
      push: (to: any) => router.push(to) as any,
      replace: (to: any) => router.replace(to) as any,
      back: () => router.back(),
      currentRoute: router.currentRoute as any
    },
    // Logger 类型完全匹配，直接传递（bind 保持 this 上下文）
    logger: {
      debug: logger.debug.bind(logger),
      info: logger.info.bind(logger),
      warn: logger.warn.bind(logger),
      error: logger.error.bind(logger)
    },
    configLoader: configLoader ? {
      loadPageConfig: (pageId: string) => configLoader.loadPageConfig(pageId),
      loadRoutes: () => configLoader.loadRoutes(),
      clearCache: () => configLoader.clearCache()
    } : undefined
  }
})

// ============ 网格配置 ============
const gridConfig = ref<ComponentConfig>({
  type: 'user-grid',
  id: 'demo-grid',
  props: {
    users: [
      { id: 1, name: 'Alice', age: 28, email: 'alice@example.com', status: 'active' },
      { id: 2, name: 'Bob', age: 32, email: 'bob@example.com', status: 'active' },
      { id: 3, name: 'Charlie', age: 25, email: 'charlie@example.com', status: 'inactive' }
    ]
  }
})

// ============ 注入能力上下文到组件树 ============
const dataSetContext = capabilityManager.getContext()

// TODO: 将 DataSet 上下文设置为页面级父上下文
// 这样所有子组件都可以通过 consume() 访问 appServices

onMounted(() => {
  logger.info('🚀 [APP Service] AppServicesDemo mounted')
  logger.info('📦 [APP Service] Capability Manager created with appServices:', {
    contextId: dataSetContext.id,
    providersCount: dataSetContext.providers.size
  })
})
</script>

<style scoped>
.app-services-demo {
  padding: 20px;
}

.info-box {
  background: #e3f2fd;
  border-left: 4px solid #2196f3;
  padding: 15px;
  margin-bottom: 20px;
  border-radius: 4px;
}

.info-box code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  color: #e91e63;
}
</style>
