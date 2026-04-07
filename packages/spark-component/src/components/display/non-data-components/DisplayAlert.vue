<template>
  <el-alert
    v-if="isVisible"
    :title="title"
    :description="description"
    :type="alertType"
    :closable="closable"
    :close-text="closeText"
    :center="center"
    :show-icon="showIcon"
    :effect="effect"
    v-bind="$attrs"
    @close="handleClose"
  />
</template>

<script setup lang="ts">
/**
 * @skill-description 警告提示组件，基于 el-alert 显示带图标的提示信息，支持 success/warning/info/error 四种类型。
 */
import { useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  title?: string
  description?: string
  alertType?: 'success' | 'warning' | 'info' | 'error'
  closable?: boolean
  closeText?: string
  center?: boolean
  showIcon?: boolean
  effect?: 'light' | 'dark'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-alert',
  alertType: 'info',
  closable: true,
  center: false,
  showIcon: false,
  effect: 'light',
})

const emit = defineEmits<{
  close: []
}>()

const { isVisible } = useSparkPageComponent(props)

function handleClose() {
  emit('close')
}
</script>
