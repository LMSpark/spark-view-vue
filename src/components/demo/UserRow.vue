<template>
  <div 
    class="user-row" 
    :class="{ selected: isSelected }"
    @click="handleClick"
  >
    <div class="row-checkbox">
      <input 
        type="checkbox" 
        :checked="isSelected"
        @change="handleCheckboxChange"
        @click.stop
      />
    </div>
    
    <!-- 递归渲染子组件 -->
    <component
      v-for="childConfig in childConfigs"
      :key="childConfig.id"
      :is="defineAsyncComponent(Spark.resolveComponent(childConfig.type) as any)"
      :config="childConfig"
    />

    <div class="row-level-badge">实例级</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { useSparkComponent, Spark } from '@spark-view/spark-component'
import type { ComponentContext } from '@spark-view/spark-component'
import type { 
  User, 
  SelectionCapability, 
  GridEventsCapability
} from './types'

interface Props {
  config: Partial<ComponentContext>
}

const props = defineProps<Props>()

// 从 config.props 获取 user 数据
const user = computed(() => props.config.props?.user as User)

const childConfigs = computed(() =>
  (props.config.children ?? []).filter(
    (c: any): c is ComponentContext => typeof (c as any).type === 'string' && (c as any).type.length > 0
  )
)
const emit = defineEmits<{
  'row-click': [user: User]
}>()

// 使用 SPARK 能力系统
const { 
  context,
  consume,
  provide: provideCapability,
  logger 
} = useSparkComponent(props.config as ComponentContext)

const isSelected = ref(false)

// ============ 能力消费 ============

// 1. 消费父组件的选择能力
const selection = consume('selection')

// 更新选中状态
const updateSelectionState = () => {
  const sel = selection?.value as SelectionCapability | null
  if (sel && user.value) {
    isSelected.value = sel.isSelected(user.value.id)
  }
}

// 2. 消费父组件的事件能力
const gridEvents = consume('gridEvents')

const events = gridEvents?.value as GridEventsCapability | null
if (events) {
  // 监听选择变化事件
  events.on('selection:changed', () => {
    updateSelectionState()
    logger.debug('🔄 Selection updated for row:', user.value?.id)
  })
}

// ============ 能力提供（给字段组件） ============

// 提供行数据能力（响应式 - 每次访问时动态获取最新 user）
const rowDataCapability = {
  getData: () => user.value!,
  getField: (field: string) => user.value?.[field as keyof User],
  isSelected: () => isSelected.value
}

provideCapability('rowData', rowDataCapability as unknown as Record<string, unknown>)

// 提供行事件能力
const rowEmitter = {
  on: (_event: string, _handler: Function) => {
    logger.debug('📝 Row event registered:', _event)
  },
  emit: (_event: string, ..._args: unknown[]) => {
    logger.debug('📡 Row event emitted:', _event, _args)
  }
}
provideCapability('rowEvents', rowEmitter)

// ============ 事件处理 ============

const handleClick = () => {
  if (!user.value) return
  
  emit('row-click', user.value)
  if (rowEmitter) {
    rowEmitter.emit('row:click', user.value)
  }
  const events = gridEvents?.value as GridEventsCapability | null
  if (events) {
    events.emit('row:clicked', user.value)
  }
  logger.info('👆 Row clicked:', user.value.name)
}

const handleCheckboxChange = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  const sel = selection?.value as SelectionCapability | null
  if (sel && user.value) {
    if (checked) {
      sel.select(user.value.id)
      logger.info('✅ Row selected:', user.value.id)
    } else {
      sel.deselect(user.value.id)
      logger.info('❌ Row deselected:', user.value.id)
    }
    updateSelectionState()
  }
}

onMounted(() => {
  updateSelectionState()
  logger.info('🚀 UserRow mounted (Instance Level)', {
    contextId: context.id,
    userId: user.value?.id,
    userName: user.value?.name,
    userFullData: user.value,
    rowData: rowDataCapability.getData(),
    rowDataFields: user.value ? {
      id: rowDataCapability.getField('id'),
      name: rowDataCapability.getField('name'),
      age: rowDataCapability.getField('age'),
      email: rowDataCapability.getField('email'),
      role: rowDataCapability.getField('role')
    } : null,
    consumedCapabilities: ['selection', 'gridEvents'],
    providedCapabilities: ['rowData', 'rowEvents']
  })
})
</script>

<style scoped>
.user-row {
  display: grid;
  grid-template-columns: 50px repeat(4, 1fr) 80px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #e9ecef;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.user-row:hover {
  background: #f8f9fa;
}

.user-row.selected {
  background: #e7f3ff;
  border-left: 3px solid #0d6efd;
}

.row-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
}

.row-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.row-level-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: #6c757d;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  opacity: 0.6;
}
</style>
