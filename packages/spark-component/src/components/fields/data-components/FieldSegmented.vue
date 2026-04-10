<template>
  <el-segmented
    v-if="isVisible"
    v-model="selectedValue"
    :options="resolvedOptions"
    :size="size"
    :block="block"
    :disabled="isDisabled"
    v-bind="$attrs"
    @change="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * @skill-description 分段选择器字段，绑定 string/number 值，基于 el-segmented 提供紧凑的互斥选项切换。
 */
import { ref, computed, watch } from 'vue'
import { useSparkPageComponent } from '../../internal'
import type { SparkRuntimeProps } from '../../shared-types.js'

type SegmentedOption = string | number | { label: string; value: string | number; disabled?: boolean }

interface Props extends SparkRuntimeProps<'r-segmented'> {
  /** 当前选中值 */
  modelValue?: string | number
  /** 选项列表 */
  options?: SegmentedOption[]
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
  /** 是否撑满父容器 */
  block?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-segmented',
  size: 'default',
  block: false,
})

const emit = defineEmits<{
  change: [value: string | number]
  'update:modelValue': [value: string | number]
}>()

const { isVisible, isDisabled } = useSparkPageComponent(props)

const resolvedOptions = computed(() => props.options ?? [])

const selectedValue = ref(props.modelValue ?? (resolvedOptions.value[0] != null
  ? (typeof resolvedOptions.value[0] === 'object' ? resolvedOptions.value[0].value : resolvedOptions.value[0])
  : ''))

watch(() => props.modelValue, (v) => {
  if (v !== undefined) selectedValue.value = v
})

function handleChange(val: string | number) {
  emit('update:modelValue', val)
  emit('change', val)
}
</script>
