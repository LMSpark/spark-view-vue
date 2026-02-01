<script setup lang="ts">
import { computed } from 'vue'

/**
 * TextRenderer - 文本类型渲染器
 * 根据 parentType 决定渲染方式：
 * - table: 渲染成表格列
 * - form: 渲染成输入框
 * - 其他: 渲染成文本显示
 */

defineOptions({
  name: 'TextRenderer'
})

interface Props {
  config: {
    type: string
    name: string      // 显示标题
    value: string     // 数据字段名
    width?: number | string
    [key: string]: any
  }
  parentType?: string  // 父级类型
  data?: any          // 绑定的数据对象
}

const props = withDefaults(defineProps<Props>(), {
  parentType: '',
  data: () => ({})
})

const emit = defineEmits<{
  update: [field: string, value: any]
}>()

// 获取当前值
const currentValue = computed(() => {
  if (!props.data || !props.config.value) return ''
  return props.data[props.config.value] || ''
})

// 处理更新
function handleUpdate(value: any) {
  emit('update', props.config.value, value)
}
</script>

<template>
  <!-- 作为表格列 -->
  <el-table-column 
    v-if="parentType === 'table'"
    :label="config.name"
    :prop="config.value"
    :width="config.width"
  >
    <!-- 支持自定义列内容 -->
    <template #default="scope">
      <slot :row="scope.row" :column="scope.column" :index="scope.$index">
        {{ scope.row[config.value] }}
      </slot>
    </template>
  </el-table-column>
  
  <!-- 作为表单字段 -->
  <el-form-item 
    v-else-if="parentType === 'form'"
    :label="config.name"
  >
    <slot :value="currentValue" :update="handleUpdate">
      <el-input 
        :model-value="currentValue"
        :placeholder="`请输入${config.name}`"
        @update:model-value="handleUpdate"
      />
    </slot>
  </el-form-item>
  
  <!-- 作为详情展示 -->
  <div v-else class="text-renderer">
    <slot :value="currentValue" :label="config.name">
      <span class="label">{{ config.name }}:</span>
      <span class="value">{{ currentValue }}</span>
    </slot>
  </div>
</template>

<style scoped>
.text-renderer {
  display: flex;
  gap: 8px;
  padding: 4px 0;
}

.label {
  font-weight: 500;
  color: #606266;
}

.value {
  color: #303133;
}
</style>
