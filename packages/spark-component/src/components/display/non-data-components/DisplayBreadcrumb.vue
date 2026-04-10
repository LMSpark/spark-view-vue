<template>
  <el-breadcrumb
    v-if="isVisible"
    :separator="separator"
    :separator-icon="separatorIcon"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-breadcrumb-child-${index}`"
      :config="child"
    />
  </el-breadcrumb>
</template>

<script setup lang="ts">
/**
 * @skill-description 面包屑导航容器，基于 el-breadcrumb 渲染多级导航路径，支持自定义分隔符。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'
import type { SparkRuntimeChildrenProps } from '../../shared-types.js'

interface Props extends SparkRuntimeChildrenProps<'r-breadcrumb'> {
  children?: SparkNode[]
  separator?: string
  separatorIcon?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-breadcrumb',
  separator: '/',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
