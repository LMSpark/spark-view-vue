<template>
  <el-mention
    v-if="isVisible"
    v-model="textValue"
    :options="resolvedOptions"
    :prefix="prefix"
    :split="split"
    :filter-option="filterOption"
    :placement="placement"
    :show-arrow="showArrow"
    :offset="offset"
    :whole="whole"
    :check-is-whole="checkIsWhole"
    :loading="loading"
    :disabled="isDisabled"
    :type="inputType"
    :placeholder="placeholder"
    :rows="rows"
    v-bind="$attrs"
    @select="handleSelect"
    @search="handleSearch"
  />
</template>

<script setup lang="ts">
/**
 * @skill-description 提及输入字段，绑定 string 值，基于 el-mention 支持 @ 前缀触发用户或实体搜索选择。
 */
import { ref, computed, watch } from 'vue'
import { useSparkPageComponent } from '../../internal'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface MentionOption {
  value: string
  label?: string
  disabled?: boolean
}

interface Props extends SparkRuntimeProps<'r-mention'> {
  /** 文本内容 */
  modelValue?: string
  /** 选项列表 */
  options?: MentionOption[]
  /** 触发前缀字符 */
  prefix?: string | string[]
  /** 分隔符 */
  split?: string
  /** 自定义过滤 */
  filterOption?: boolean | ((pattern: string, option: MentionOption) => boolean)
  /** 弹出位置 */
  placement?: 'top' | 'bottom'
  /** 显示箭头 */
  showArrow?: boolean
  /** 偏移量 */
  offset?: number
  /** 匹配整体 */
  whole?: boolean
  /** 校验整体函数 */
  checkIsWhole?: (pattern: string, prefix: string) => boolean
  /** 加载状态 */
  loading?: boolean
  /** 输入类型 */
  inputType?: 'text' | 'textarea'
  /** 占位提示 */
  placeholder?: string
  /** textarea 行数 */
  rows?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-mention',
  prefix: '@',
  split: ' ',
  placement: 'bottom',
  showArrow: false,
  inputType: 'text',
  rows: 3,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [option: MentionOption, prefix: string]
  search: [pattern: string, prefix: string]
}>()

const { isVisible, isDisabled } = useSparkPageComponent(props)

const resolvedOptions = computed(() => props.options ?? [])

const textValue = ref(props.modelValue ?? '')

watch(() => props.modelValue, (v) => {
  if (v !== undefined) textValue.value = v
})

watch(textValue, (v) => {
  emit('update:modelValue', v)
})

function handleSelect(option: MentionOption, prefix: string) {
  emit('select', option, prefix)
}

function handleSearch(pattern: string, prefix: string) {
  emit('search', pattern, prefix)
}
</script>
