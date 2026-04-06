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
    v-bind="$attrs"
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
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  content?: string
  placement?: string
  effect?: 'dark' | 'light'
  offset?: number
  showAfter?: number
  hideAfter?: number
  showArrow?: boolean
  enterable?: boolean
  popperClass?: string
  rawContent?: boolean
}

const props = withDefaults(defineProps<Props>(), {
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
