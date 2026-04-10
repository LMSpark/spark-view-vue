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
/**
 * @skill-description 卡片容器，基于 el-card 提供带可选头部的容器，在卡片体内渲染子组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  header?: string
  shadow?: 'always' | 'hover' | 'never'
  bodyStyle?: object | string
  bodyClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-card',
  shadow: 'always',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
