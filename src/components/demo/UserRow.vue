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
    
    <!-- 字段级组件：UserField -->
    <UserField
      :config="createFieldConfig('name')"
      :value="user.name"
      :label="'姓名'"
      icon="👤"
    />
    
    <UserField
      :config="createFieldConfig('age')"
      :value="user.age"
      :label="'年龄'"
      icon="🎂"
    />
    
    <UserField
      :config="createFieldConfig('email')"
      :value="user.email"
      :label="'邮箱'"
      icon="📧"
    />
    
    <UserField
      :config="createFieldConfig('status')"
      :value="user.status"
      :label="'状态'"
      icon="🔔"
      :highlight="user.status === 'active'"
    />

    <div class="row-level-badge">实例级</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Spark } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import UserField from './UserField.vue'
import type { 
  User, 
  SelectionCapability, 
  GridEventsCapability,
  RowDataCapability
} from './types'

interface Props {
  config: ComponentConfig
  user: User
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'row-click': [user: User]
}>()

// 使用 SPARK 能力系统
const { 
  context,
  consume,
  provide: provideCapability,
  logger 
} = Spark.useSpark(props.config)

const isSelected = ref(false)

// 创建字段配置
const createFieldConfig = (field: string): ComponentConfig => ({
  type: 'user-field',
  id: `field-${field}-${props.user.id}`,
  props: { field }
})

// ============ 能力消费 ============

// 1. 消费父组件的选择能力
const selection = consume('selection')

// 更新选中状态
const updateSelectionState = () => {
  const sel = selection?.value as SelectionCapability | null
  if (sel) {
    isSelected.value = sel.isSelected(props.user.id)
  }
}

// 2. 消费父组件的事件能力
const gridEvents = consume('gridEvents')

const events = gridEvents?.value as GridEventsCapability | null
if (events) {
  // 监听选择变化事件
  events.on('selection:changed', () => {
    updateSelectionState()
    logger.debug('🔄 Selection updated for row:', props.user.id)
  })
}

// ============ 能力提供（给字段组件） ============

// 提供行数据能力（类型安全）
const rowDataCapability: RowDataCapability = {
  getData: () => props.user,
  getField: (field: string) => props.user[field as keyof User],
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
  emit('row-click', props.user)
  if (rowEmitter) {
    rowEmitter.emit('row:click', props.user)
  }
  const events = gridEvents?.value as GridEventsCapability | null
  if (events) {
    events.emit('row:clicked', props.user)
  }
  logger.info('👆 Row clicked:', props.user.name)
}

const handleCheckboxChange = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  const sel = selection?.value as SelectionCapability | null
  if (sel) {
    if (checked) {
      sel.select(props.user.id)
      logger.info('✅ Row selected:', props.user.id)
    } else {
      sel.deselect(props.user.id)
      logger.info('❌ Row deselected:', props.user.id)
    }
    updateSelectionState()
  }
}

onMounted(() => {
  updateSelectionState()
  logger.info('🚀 UserRow mounted (Instance Level)', {
    contextId: context.id,
    userId: props.user.id,
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
