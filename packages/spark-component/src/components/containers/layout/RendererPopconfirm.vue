<template>
  <el-popconfirm
    v-if="isVisible"
    :title="title"
    :confirm-button-text="confirmButtonText"
    :cancel-button-text="cancelButtonText"
    :confirm-button-type="confirmButtonType"
    :cancel-button-type="cancelButtonType"
    :icon="icon"
    :icon-color="iconColor"
    :hide-icon="hideIcon"
    :hide-after="hideAfter"
    :width="width"
    @confirm="$emit('confirm')"
    @cancel="$emit('cancel')"
  >
    <template #reference>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-popconfirm-child-${index}`"
        :config="child"
      />
    </template>
  </el-popconfirm>
</template>

<script setup lang="ts">
/**
 * @skill r-popconfirm
 * @description 确认气泡组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RPopconfirmProps } from './RendererPopconfirm.props'



const props = withDefaults(defineProps<RPopconfirmProps>(), {
  type: 'r-popconfirm',
  confirmButtonType: 'primary',
  cancelButtonType: '',
  iconColor: '#f90',
  hideIcon: false,
  width: 150,
})

defineEmits<{
  /** Confirm requested; 用户确认当前危险或二次确认动作。 */
  confirm: []
  /** Cancel requested; 用户取消当前二次确认动作。 */
  cancel: []
}>()

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


