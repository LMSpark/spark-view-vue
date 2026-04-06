<template>
  <el-scrollbar
    v-if="isVisible"
    :height="height"
    :max-height="maxHeight"
    :native="native"
    :wrap-style="wrapStyle"
    :wrap-class="wrapClass"
    :view-style="viewStyle"
    :view-class="viewClass"
    :noresize="noresize"
    :always="always"
    :min-size="minSize"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-scrollbar-child-${index}`"
      :config="child"
    />
  </el-scrollbar>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  height?: string | number
  maxHeight?: string | number
  native?: boolean
  wrapStyle?: string | Record<string, string>
  wrapClass?: string
  viewStyle?: string | Record<string, string>
  viewClass?: string
  noresize?: boolean
  always?: boolean
  minSize?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-scrollbar',
  native: false,
  noresize: false,
  always: false,
  minSize: 20,
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
