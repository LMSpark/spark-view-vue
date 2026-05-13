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
    @close="handleClose"
  />
</template>

<script setup lang="ts">
/**
 * @skill r-alert
 * @description 警告提示组件，支持 success/warning/info/error 四种类型。
 */
import { useSparkPageComponent } from '../../internal'
import type { RAlertProps } from './DisplayAlert.props'

const props = withDefaults(defineProps<RAlertProps>(), {
  type: 'r-alert',
  alertType: 'info',
  closable: true,
  center: false,
  showIcon: false,
  effect: 'light',
})

const emit = defineEmits<{
  /** Alert close requested; 用户关闭当前提示条。 */
  close: []
}>()

const { isVisible } = useSparkPageComponent(props)

function handleClose() {
  emit('close')
}
</script>


