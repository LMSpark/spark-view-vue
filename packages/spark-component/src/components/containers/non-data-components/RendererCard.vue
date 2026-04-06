<template>
  <el-card
    v-if="isVisible"
    :shadow="shadow"
    :body-style="bodyStyle"
    :body-class="bodyClass"
    v-bind="$attrs"
  >
    <template v-if="header || $slots['header']" #header>
      <div class="r-card-header">
        <span v-if="header">{{ header }}</span>
        <slot name="header" />
      </div>
    </template>
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-card-child-${index}`"
      :config="child"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  header?: string
  shadow?: 'always' | 'hover' | 'never'
  bodyStyle?: Record<string, string> | string
  bodyClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-card',
  shadow: 'always',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
