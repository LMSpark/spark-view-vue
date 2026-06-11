<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayBreadcrumb
DisplayBreadcrumb 模块，属于 SPARK component display/static-display。
组件目录: display/non-data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-breadcrumb
    v-if="isVisible"
    :separator="separator"
    :separator-icon="separatorIcon"
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
 * @description 面包屑导航容器，支持自定义分隔符。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RBreadcrumbProps } from './DisplayBreadcrumb.props'

const props = withDefaults(defineProps<RBreadcrumbProps>(), {
  type: 'r-breadcrumb',
  separator: '/',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


