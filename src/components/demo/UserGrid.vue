<template>
  <div class="user-grid">
    <!-- 网格头部：标题和操作按钮 -->
    <div class="grid-header">
      <h3>👥 用户列表</h3>
      <div class="grid-actions">
        <button @click="handleRefresh" class="btn-action">🔄 刷新</button>
        <button @click="handleSelectAll" class="btn-action">☑️ 全选</button>
        <button @click="handleClearSelection" class="btn-action">❌ 清空</button>
        <button @click="handleNavigateHome" class="btn-action">🏠 首页</button>
      </div>
    </div>
    
    <!-- 网格信息栏：统计和能力提示 -->
    <div class="grid-info">
      <span>已选中: {{ selectedCount }} / {{ usersFromConfig.length }}</span>
      <span>提供能力: selection, gridEvents</span>
    </div>

    <!-- 网格主体：动态渲染子组件 -->
    <div class="grid-body">
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
import { Cap } from '@spark-view/spark-utils'
import type { ComponentContext } from '@spark-view/spark-component'

/**
 * 用户网格组件 - SPARK 能力系统综合演示
 * 
 * @component UserGrid
 * @description
 * 功能完整的用户列表网格组件，展示 SPARK 能力系统的核心特性：
 * - **能力消费**：从父组件获取 APP_SERVICES（路由、日志）
 * - **能力提供**：向子组件提供 SELECTION、GRID_EVENTS
 * - **递归渲染**：动态渲染 UserRow 子组件
 * - **状态管理**：维护选中状态和用户交互
 * - **事件总线**：通过 GRID_EVENTS 广播用户操作事件
 * 
 * @example
 * ```vue
 * <UserGrid
 *   :config="{
 *     type: 'user-grid',
 *     id: 'grid-1',
 *     props: {
 *       dataset: {
 *         tables: {
 *           Users: {
 *             columns: [
 *               { name: 'id', type: 'number', label: 'ID' },
 *               { name: 'name', type: 'string', label: '姓名' },
 *               { name: 'email', type: 'string', label: '邮箱' }
 *             ],
 *             rows: [
 *               { id: 1, name: '张三', email: 'zhang@example.com' },
 *               { id: 2, name: '李四', email: 'li@example.com' }
 *             ]
 *           }
 *         }
 *       }
 *     },
 *     children: [
 *       { type: 'user-row', id: 'row-1' },
 *       { type: 'user-row', id: 'row-2' }
 *     ]
 *   }"
 * />
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */

// ============================================================
// 类型定义
// ============================================================

/**
 * 组件属性定义
 */
interface Props {
  /**
   * 组件配置对象
   * 必须包含 props.dataset.tables.Users 数据结构
   * @example
   * {
   *   type: 'user-grid',
   *   props: {
   *     dataset: {
   *       tables: {
   *         Users: {
   *           columns: [{ name: 'id', type: 'number', label: 'ID' }],
   *           rows: [{ id: 1, name: '张三' }]
   *         }
   *       }
   *     }
   *   },
   *   children: [{ type: 'user-row', id: 'row-1' }]
   * }
   */
  config: Partial<ComponentContext> & {
    props?: {
      // 仅支持 DataSet 格式
      dataset?: {
        tables?: {
          Users?: {
            columns?: Array<{
              name: string
              type: string
              label?: string
            }>
            rows?: Record<string, unknown>[]
          }
        }
      }
    }
  }
}

const props = defineProps<Props>()

// ============================================================
// SPARK 组件系统初始化
// ============================================================

const { 
  context, 
  provide: provideCapability,
  provideEvents,
  consume,
  getComponent,
  logger: sparkLogger
} = useSparkComponent(props.config as ComponentContext)

// ============================================================
// 应用服务消费
// ============================================================

// 通过能力系统消费 APP 服务（router、logger 等）
const appServices = consume(Cap.APP_SERVICES)

// 便捷访问路由
const appRouter = computed(() => appServices?.router)

// ============================================================
// 数据获取与转换
// ============================================================

// 从 DataSet 配置获取用户数据
const usersFromConfig = computed(() => {
  return props.config.props?.['dataset']?.tables?.Users?.rows || []
})

// 生成子组件配置（为每个用户创建一个 row 组件）
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
    id: `row-${user['id']}`,
    type: template.type,
    props: {
      ...template.props,
      user // 传递 user 数据到子组件
    }
  }))
})

// ============================================================
// 状态管理
// ============================================================

// 选中的行 ID 集合
const selectedIds = ref<Set<number>>(new Set())

// 选中行数量
const selectedCount = computed(() => selectedIds.value.size)

// ============================================================
// 能力提供（Provider Pattern）
// ============================================================

// 提供选择管理能力（供 UserRow 消费）
provideCapability(Cap.SELECTION, {
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

// 提供事件发布能力（Event Emitter）
const gridEventsEmitter = provideEvents(Cap.GRID_EVENTS)

// ============================================================
// 事件处理器
// ============================================================

// 刷新网格数据
const handleRefresh = () => {
  sparkLogger.info('🔄 Grid refreshing')
  gridEventsEmitter.emit('grid:refresh')
}

// 全选所有行
const handleSelectAll = () => {
  usersFromConfig.value.forEach(u => selectedIds.value.add(u['id'] as number))
  gridEventsEmitter.emit('selection:changed', Array.from(selectedIds.value))
}

// 清空选择
const handleClearSelection = () => {
  selectedIds.value.clear()
  gridEventsEmitter.emit('selection:changed', [])
}

// 导航到首页
const handleNavigateHome = () => {
  appRouter.value?.push('/')
}

// ============================================================
// 生命周期
// ============================================================

onMounted(() => {
  sparkLogger.info('🚀 UserGrid mounted', {
    contextId: context.id,
    userCount: usersFromConfig.value.length
  })
})
</script>

<style scoped>
/* ============================================================
   网格容器
   ============================================================ */
.user-grid {
  background: white;
  border-radius: 6px;
  border: 1px solid #dee2e6;
  overflow: hidden;
}

/* ============================================================
   头部样式
   ============================================================ */
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

/* 操作按钮组 */
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

/* ============================================================
   信息栏样式
   ============================================================ */
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

/* ============================================================
   主体区域
   ============================================================ */
.grid-body {
  padding: 0;
}
</style>
