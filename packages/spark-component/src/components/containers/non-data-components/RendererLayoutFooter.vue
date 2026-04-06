<template>
  <el-footer v-if="isVisible" :height="footerHeight" v-bind="$attrs">
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-layout-footer-child-${index}`"
      :config="child"
    />
  </el-footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  /** 底部高度 */
  footerHeight?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-layout-footer',
  footerHeight: '60px',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
