<template>
  <el-breadcrumb-item
    v-if="isVisible"
    :to="to"
    :replace="replace"
    v-bind="$attrs"
  >
    {{ label }}
  </el-breadcrumb-item>
</template>

<script setup lang="ts">
/**
 * @skill r-breadcrumb-item
 * @description 面包屑导航项，基于 el-breadcrumb-item 定义单个导航节点，支持链接跳转。
 */
import { useSparkPageComponent } from '../../internal'
import type { RBreadcrumbItemProps } from './DisplayBreadcrumbItem.props'

const props = withDefaults(defineProps<RBreadcrumbItemProps>(), {
  type: 'r-breadcrumb-item',
  replace: false,
})

const { isVisible } = useSparkPageComponent(props)
</script>
