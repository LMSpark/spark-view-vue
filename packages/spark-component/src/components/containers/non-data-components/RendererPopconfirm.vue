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
    v-bind="$attrs"
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
 * @description 确认气泡组件，基于 el-popconfirm 在目标元素上弹出确认/取消操作提示。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface RendererPopconfirmProps {
  type?: 'r-popconfirm'
  children?: SparkNode[]
  title?: string
  confirmButtonText?: string
  cancelButtonText?: string
  confirmButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  cancelButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  icon?: string
  iconColor?: string
  hideIcon?: boolean
  hideAfter?: number
  width?: number | string
}

const props = withDefaults(defineProps<RendererPopconfirmProps>(), {
  type: 'r-popconfirm',
  confirmButtonType: 'primary',
  cancelButtonType: '',
  iconColor: '#f90',
  hideIcon: false,
  width: 150,
})

defineEmits<{
  confirm: []
  cancel: []
}>()

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
