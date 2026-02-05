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
      <span>已选中: {{ selectedCount }} / {{ users.length }}</span>
      <span>提供能力: selection, gridEvents, dataSource</span>
    </div>

    <div class="grid-body">
      <!-- 实例级组件：UserRow -->
      <UserRow
        v-for="user in users"
        :key="user.id"
        :config="createRowConfig(user)"
        :user="user"
        @row-click="handleRowClick"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Spark } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import UserRow from './UserRow.vue'

interface User {
  id: number
  name: string
  age: number
  email: string
  status: string
}

interface Props {
  config: ComponentConfig
}

const props = defineProps<Props>()

// ============ 组件能力系统 (SPARK Capability) ============
// 组件级能力：selection, dataSource, events 等
const { 
  context, 
  provide: provideCapability,
  consume,
  logger: sparkLogger  // SPARK 组件 logger
} = Spark.useSpark(props.config)

// ============ 消费 APP 服务能力（从页面层提供）============
// 🎯 关键：通过能力系统消费，不需要直接导入
const appServices = consume('appServices')

// 便捷访问（类型守卫）
const appRouter = computed(() => {
  const services = appServices?.value
  if (!services) return null
  return (services as any).router
})
const appLogger = computed(() => {
  const services = appServices?.value
  if (!services) return null
  return (services as any).logger
})

// 选中的行
const selectedIds = ref<Set<number>>(new Set())

const users = computed(() => (props.config.props?.users as User[]) || [])
const selectedCount = computed(() => selectedIds.value.size)

// 创建行配置
const createRowConfig = (user: User): ComponentConfig => ({
  type: 'user-row',
  id: `row-${user.id}`,
  props: { user }
})

// ============ 能力提供 ============

// 1. 提供选择能力（数据流）
provideCapability('selection', {
  isSelected: (id: number) => selectedIds.value.has(id),
  select: (id: number) => {
    selectedIds.value.add(id)
    emitter.emit('selection:changed', Array.from(selectedIds.value))
    sparkLogger.info('✅ Selected row:', id)
  },
  deselect: (id: number) => {
    selectedIds.value.delete(id)
    emitter.emit('selection:changed', Array.from(selectedIds.value))
    sparkLogger.info('❌ Deselected row:', id)
  },
  selectAll: () => {
    users.value.forEach(u => selectedIds.value.add(u.id))
    emitter.emit('selection:changed', Array.from(selectedIds.value))
    sparkLogger.info('☑️ Selected all rows')
  },
  clearSelection: () => {
    selectedIds.value.clear()
    emitter.emit('selection:changed', [])
    sparkLogger.info('🗑️ Cleared selection')
  },
  getSelected: () => Array.from(selectedIds.value)
})

// 2. 提供事件能力
const emitter = {
  on: (_event: string, _handler: Function) => {
    sparkLogger.debug('📝 Event registered:', _event)
  },
  emit: (event: string, ...args: unknown[]) => {
    sparkLogger.debug('📡 Event emitted:', event, args)
  }
}
provideCapability('gridEvents', emitter)

// 3. 提供数据源能力
provideCapability('dataSource', {
  getData: () => users.value,
  refresh: () => {
    sparkLogger.info('🔄 Data refreshed')
    emitter.emit('data:refreshed', users.value)
  }
})

// ============ 事件处理 ============

const handleRowClick = (user: User) => {
  sparkLogger.info('🎯 Grid received row click:', user.name)
  emitter.emit('row:click', user)
}

const handleRefresh = () => {
  // 使用 APP 服务能力
  appLogger.value?.info('🔄 [APP Service] Grid refreshing...')
  sparkLogger.info('🔄 Grid refreshing...')
  emitter.emit('grid:refresh')
}

const handleSelectAll = () => {
  selectedIds.value.clear()
  users.value.forEach(u => selectedIds.value.add(u.id))
  emitter.emit('selection:changed', Array.from(selectedIds.value))
  sparkLogger.info('☑️ All rows selected')
}

const handleClearSelection = () => {
  selectedIds.value.clear()
  emitter.emit('selection:changed', [])
  sparkLogger.info('🗑️ Selection cleared')
}

const handleNavigateHome = () => {
  // 使用 APP 服务能力：导航
  appLogger.value?.info('🏠 [APP Service] Navigating to home via router')
  appRouter.value?.push('/')
}

onMounted(() => {
  // 使用 APP 服务能力
  appLogger.value?.info('🚀 [APP Service] UserGrid component mounted')
  sparkLogger.info('🚀 UserGrid mounted (Model Level)', {
    contextId: context.id,
    providedCapabilities: ['selection', 'gridEvents', 'dataSource'],
    hasAppServices: !!(appServices?.value)
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
