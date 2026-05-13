<template>
  <el-check-tag
    v-if="isVisible"
    :checked="isChecked"
    :disabled="isDisabled"
    @change="handleChange"
  >
    <slot>{{ label }}</slot>
  </el-check-tag>
</template>

<script setup lang="ts">
/**
 * @skill r-check-tag
 * @description 标签选择字段，绑定 boolean 值。
 */
import { ref, watch } from 'vue'
import { useSparkPageComponent } from '../../internal'
import type { RCheckTagProps } from './FieldCheckTag.props'

const props = withDefaults(defineProps<RCheckTagProps>(), {
  type: 'r-check-tag',
  checked: false,
})

const emit = defineEmits<{
  /**
   * Checked state changed; 用户切换标签选中状态。
   * @param checked Next checked state.
   */
  change: [checked: boolean]
  /**
   * Checked state synced; 同步 checked 受控值。
   * @param checked Next checked state.
   */
  'update:checked': [checked: boolean]
}>()

const { isVisible, isDisabled } = useSparkPageComponent(props)

const isChecked = ref(props.checked)

watch(() => props.checked, (v) => {
  isChecked.value = v
})

function handleChange(val: boolean) {
  isChecked.value = val
  emit('update:checked', val)
  emit('change', val)
}
</script>


