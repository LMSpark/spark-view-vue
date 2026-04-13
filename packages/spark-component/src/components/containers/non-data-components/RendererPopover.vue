<template>
  <el-popover
    v-if="isVisible"
    :title="title"
    :content="content"
    :placement="placement"
    :width="width"
    :trigger="trigger"
    :effect="effect"
    :disabled="isDisabled"
    :offset="offset"
    :show-after="showAfter"
    :hide-after="hideAfter"
    :show-arrow="showArrow"
    :popper-class="popperClass"
    v-bind="$attrs"
  >
    <template #reference>
      <SparkComponentRenderer
        v-for="(child, index) in referenceChildren"
        :key="nodeId(child) ?? `r-popover-ref-${index}`"
        :config="child"
      />
    </template>
    <template v-if="contentChildren.length" #default>
      <SparkComponentRenderer
        v-for="(child, index) in contentChildren"
        :key="nodeId(child) ?? `r-popover-content-${index}`"
        :config="child"
      />
    </template>
  </el-popover>
</template>

<script setup lang="ts">
/**
 * @skill r-popover
 * @description 弹出提示容器，基于 el-popover 为触发元素显示浮层内容，支持多种触发方式和位置。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface RendererPopoverProps {
  type?: 'r-popover'
  children?: SparkNode[]
  contentChildren?: SparkNode[]
  title?: string
  content?: string
  placement?: string
  width?: number | string
  trigger?: 'click' | 'hover' | 'focus' | 'contextmenu'
  effect?: 'dark' | 'light'
  offset?: number
  showAfter?: number
  hideAfter?: number
  showArrow?: boolean
  popperClass?: string
}

const props = withDefaults(defineProps<RendererPopoverProps>(), {
  type: 'r-popover',
  placement: 'bottom',
  width: 150,
  trigger: 'click',
  effect: 'light',
  showArrow: true,
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const referenceChildren = computed(() => getSparkNodeChildren(props.children))
const contentChildren = computed(() => getSparkNodeChildren(props.contentChildren))
</script>
