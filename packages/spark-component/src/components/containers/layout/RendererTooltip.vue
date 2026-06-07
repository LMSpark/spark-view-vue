<template>
  <el-tooltip
    v-if="isVisible"
    :content="content"
    :placement="placement"
    :effect="effect"
    :disabled="isDisabled"
    :offset="offset"
    :show-after="showAfter"
    :hide-after="hideAfter"
    :show-arrow="showArrow"
    :enterable="enterable"
    :popper-class="popperClass"
    :raw-content="rawContent"
  >
    <template #default>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-tooltip-child-${index}`"
        :config="child"
      />
    </template>
  </el-tooltip>
</template>

<script setup lang="ts">
/**
 * @description 文字提示组件，支持位置和延迟配置。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RTooltipProps } from './RendererTooltip.props'



const props = withDefaults(defineProps<RTooltipProps>(), {
  type: 'r-tooltip',
  placement: 'bottom',
  effect: 'dark',
  showArrow: true,
  enterable: true,
  rawContent: false,
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


