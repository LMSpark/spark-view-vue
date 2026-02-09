<template>
  <div class="user-grid">
    <div class="grid-header">
      <h3>👥 用户列表</h3>
      <div class="grid-actions">
        <button @click="handleRefresh" class="btn-action">🔄 刷新</button>
        <button @click="handleSelectAll" class="btn-action">☑️ 全选</button>
        <button @click="handleClearSelection" class="btn-action">❌ 清空</button>
        <button @click="handleNavigateHome" class="btn-action">🏠 首页</button>
      </div>
    </div>
    
    <div class="grid-info">
      <span>已选中: {{ selectedCount }} / {{ usersFromConfig.length }}</span>
      <span>提供能力: fieldMetadata, selection, gridEvents, dataSource</span>
    </div>

    <div class="grid-body">
      <!-- 渲染为每个user生成的配置 -->
      <component
        v-for="childConfig in childConfigs"
        :key="childConfig.id"
        :is="getComponent(childConfig.type)"
        :config="childConfig"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import {
  APP_SERVICES,
  FIELD_METADATA,
  SELECTION,
  GRID_EVENTS,
  DATA_SOURCE
} from '@spark-view/spark-utils'
import type { ComponentContext } from '@spark-view/spark-component'

interface Props {
  config: Partial<ComponentContext> & {
    props?: {
      // 仅支持 DataSet 格式
      dataset?: {
        tables?: {
          Users?: {
            rows?: Record<string, unknown>[]
          }
        }
      }
    }
  }
}

const props = defineProps<Props>()

// 从 DataSet 配置获取 users
const usersFromConfig = computed(() => {
  return props.config.props?.dataset?.tables?.Users?.rows || []
})

// 🎯 生成子组件配置（为每个 user 创建一个 row）
const childConfigs = computed(() => {
  const children = props.config.children ?? []
  const users = usersFromConfig.value
  
  if (children.length === 0 || users.length === 0) {
    return []
  }
  
  // 使用第一个 child 作为模板，为每个 user 生成配置
  const template = children[0]
  if (!template?.type) {
    return []
  }
  
  return users.map(user => ({
    ...template,
    id: `row-${user.id}`,
    type: template.type,
    props: {
      ...template.props,
      user // 传递 user 数据
    }
  }))
})

// ============ 组件能力系统 (SPARK Capability) ============
const { 
  context, 
  provide: provideCapability,
  provideEvents,
  consume,
  getComponent,
  logger: sparkLogger
} = useSparkComponent(props.config as ComponentContext)

// ============ 消费 APP 服务能力（从页面层提供）============
// 🎯 关键：通过能力系统消费，不需要直接导入
const appServices = consume(APP_SERVICES)

// 便捷访问
const appRouter = computed(() => {
  return appServices?.router
})

// 选中的行
const selectedIds = ref<Set<number>>(new Set())

const selectedCount = computed(() => selectedIds.value.size)

// ============ 字段元数据定义 ============

// 从配置中获取字段元数据
const fieldMetadata = computed(() => {
  return (props.config.props?.fieldMetadata as Record<string, { label: string; icon: string; type: string }>) || {}
})

// ============ 能力提供 ============

// 0. 提供字段元数据能力（供 UserField 消费）
provideCapability(FIELD_METADATA, fieldMetadata.value)

// 1. 提供选择能力（数据流）
provideCapability(SELECTION, {
  isSelected: (id: number) => selectedIds.value.has(id),
  select: (id: number) => {
    selectedIds.value.add(id)
    gridEventsEmitter.emit('selection:changed', Array.from(selectedIds.value))
    sparkLogger.info('✅ Selected row:', id)
  },
  deselect: (id: number) => {
    selectedIds.value.delete(id)
    gridEventsEmitter.emit('selection:changed', Array.from(selectedIds.value))
    sparkLogger.info('❌ Deselected row:', id)
  },
  selectAll: () => {
    usersFromConfig.value.forEach(u => selectedIds.value.add(u['id'] as number))
    gridEventsEmitter.emit('selection:changed', Array.from(selectedIds.value))
    sparkLogger.info('☑️ Selected all rows')
  },
  clearSelection: () => {
    selectedIds.value.clear()
    gridEventsEmitter.emit('selection:changed', [])
    sparkLogger.info('🗑️ Cleared selection')
  },
  getSelected: () => Array.from(selectedIds.value)
})

// 2. 提供事件能力（使用真正的事件系统）
const gridEventsEmitter = provideEvents(GRID_EVENTS)

// 3. 提供数据源能力
provideCapability(DATA_SOURCE, {
  getData: () => usersFromConfig.value,
  refresh: () => {
    sparkLogger.info('🔄 Data refreshed')
    gridEventsEmitter.emit('data:refreshed', usersFromConfig.value)
  }
})

// ============ 事件处理 ============

const handleRefresh = () => {
  sparkLogger.info('🔄 Grid refreshing')
  gridEventsEmitter.emit('grid:refresh')
}

const handleSelectAll = () => {
  usersFromConfig.value.forEach(u => selectedIds.value.add(u['id'] as number))
  gridEventsEmitter.emit('selection:changed', Array.from(selectedIds.value))
}

const handleClearSelection = () => {
  selectedIds.value.clear()
  gridEventsEmitter.emit('selection:changed', [])
}

const handleNavigateHome = () => {
  appRouter.value?.push('/')
}

onMounted(() => {
  sparkLogger.info('🚀 UserGrid mounted', {
    contextId: context.id,
    userCount: usersFromConfig.value.length
  })
})
</script>

<style scoped>
.user-grid {
  background: white;
  border-radius: 6px;
  border: 1px solid #dee2e6;
  overflow: hidden;
}

.grid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.grid-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.grid-actions {
  display: flex;
  gap: 8px;
}

.btn-action {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

.grid-info {
  display: flex;
  justify-content: space-between;
  padding: 12px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  font-size: 13px;
  color: #6c757d;
}

.grid-info span:last-child {
  color: #0d6efd;
  font-weight: 500;
}

.grid-body {
  padding: 0;
}
</style>
