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
 * @description 弹出提示容器，支持多种触发方式和位置。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RPopoverProps } from './RendererPopover.props'



const props = withDefaults(defineProps<RPopoverProps>(), {
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


