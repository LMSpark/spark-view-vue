<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayBreadcrumbItem
DisplayBreadcrumbItem 模块，属于 SPARK component display/static-display。
组件目录: display/non-data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-breadcrumb-item
    v-if="isVisible"
    :to="to"
    :replace="replace"
  >
    {{ label }}
  </el-breadcrumb-item>
</template>

<script setup lang="ts">
/**
 * @description 面包屑导航项，支持链接跳转。
 */
import { useSparkPageComponent } from '../../internal'
import type { RBreadcrumbItemProps } from './DisplayBreadcrumbItem.props'

const props = withDefaults(defineProps<RBreadcrumbItemProps>(), {
  type: 'r-breadcrumb-item',
  replace: false,
})

const { isVisible } = useSparkPageComponent(props)
</script>


