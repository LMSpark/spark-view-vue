<template>
  <div class="config-driven-demo">
    <h2>⚙️ 配置驱动递归渲染演示</h2>
    
    <div class="info-box">
      <p>✅ 使用配置文件 + 递归渲染器实现组件树</p>
      <p>📦 无需硬编码组件关系，完全由配置驱动</p>
      <p>🔄 支持动态子节点生成、条件渲染、事件处理</p>
    </div>

    <div class="config-selector">
      <button 
        v-for="preset in presets" 
        :key="preset.name"
        @click="currentPreset = preset.name"
        :class="{ active: currentPreset === preset.name }"
        class="preset-btn"
      >
        {{ preset.label }}
      </button>
    </div>

    <!-- 配置驱动递归渲染 -->
    <DemoRenderer 
      v-if="renderConfig"
      :node="renderConfig" 
      :context="renderContext"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useLogger } from '@spark-view/spark-app'
import { SparkData } from '@spark-view/spark-data'
import DemoRenderer from './DemoRenderer.vue'
import { 
  createSimpleConfig, 
  createCustomFieldsConfig,
  createReadOnlyConfig,
  type FieldConfig
} from './demo-config'
import type { User } from './types'

// ============ 获取 APP 层服务 ============
const router = useRouter()
const logger = useLogger()
const configLoader = inject<{
  loadPageConfig(pageId: string): unknown
  loadRoutes(): unknown
  clearCache(): void
} | null>('configLoader', null)

// ============ 创建 DataSet ============
const dataSet = SparkData.classes.DataSetManager.create({
    dataSetName: 'ConfigDrivenDemo',
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
                { id: 3, name: 'Charlie', age: 25, email: 'charlie@example.com', status: 'inactive' },
                { id: 4, name: 'Diana', age: 29, email: 'diana@example.com', status: 'active' }
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

// ============ 创建能力管理器 ============
const capabilityManager = SparkData.createCapabilityManager('config-driven-demo', {
  dataSet,
  appServices: {
    router: {
      push: (to) => router.push(to as string),
      replace: (to) => router.replace(to as string),
      back: () => router.back(),
      currentRoute: router.currentRoute
    },
    logger: {
      debug: logger.debug.bind(logger),
      info: logger.info.bind(logger),
      warn: logger.warn.bind(logger),
      error: logger.error.bind(logger)
    },
    configLoader: configLoader ? {
      loadPageConfig: (pageId: string) => Promise.resolve(configLoader.loadPageConfig(pageId)),
      loadRoutes: () => Promise.resolve(configLoader.loadRoutes()),
      clearCache: () => configLoader.clearCache()
    } : undefined
  }
})

// ============ 用户数据 ============
const users = ref<User[]>([
  { id: 1, name: 'Alice', age: 28, email: 'alice@example.com', status: 'active' },
  { id: 2, name: 'Bob', age: 32, email: 'bob@example.com', status: 'active' },
  { id: 3, name: 'Charlie', age: 25, email: 'charlie@example.com', status: 'inactive' },
  { id: 4, name: 'Diana', age: 29, email: 'diana@example.com', status: 'active' }
])

// ============ 配置预设 ============
const currentPreset = ref('simple')

const presets = [
  { name: 'simple', label: '📋 标准配置' },
  { name: 'custom', label: '🎨 自定义字段' },
  { name: 'readonly', label: '👁️ 只读模式' }
]

// 自定义字段配置
const customFields: FieldConfig[] = [
  { field: 'id', label: 'ID', icon: '🔢' },
  { field: 'name', label: '用户名', icon: '👤' },
  { field: 'status', label: '在线状态', icon: '🟢', highlight: (v) => v === 'active' }
]

// 当前渲染配置
const renderConfig = computed(() => {
  switch (currentPreset.value) {
    case 'simple':
      return createSimpleConfig(users.value)
    case 'custom':
      return createCustomFieldsConfig(users.value, customFields)
    case 'readonly':
      return createReadOnlyConfig(users.value)
    default:
      return createSimpleConfig(users.value)
  }
})

// 渲染上下文（传递给渲染器）
const renderContext = computed(() => ({
  users: users.value,
  dataSet,
  capabilityManager,
  appServices: {
    router,
    logger
  }
}))

onMounted(() => {
  logger.info('🚀 ConfigDrivenDemo mounted', {
    usersCount: users.value.length,
    preset: currentPreset.value
  })
})
</script>

<style scoped>
.config-driven-demo {
  padding: 20px;
}

.info-box {
  background: #e3f2fd;
  border-left: 4px solid #2196f3;
  padding: 16px;
  margin: 16px 0;
  border-radius: 4px;
}

.info-box p {
  margin: 8px 0;
  color: #1565c0;
}

.info-box code {
  background: rgba(0,0,0,0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.config-selector {
  display: flex;
  gap: 12px;
  margin: 20px 0;
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
}

.preset-btn {
  padding: 10px 20px;
  border: 2px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.preset-btn:hover {
  border-color: #2196f3;
  background: #e3f2fd;
}

.preset-btn.active {
  border-color: #2196f3;
  background: #2196f3;
  color: white;
  font-weight: bold;
}

h2 {
  color: #1976d2;
  margin-bottom: 16px;
}
</style>
