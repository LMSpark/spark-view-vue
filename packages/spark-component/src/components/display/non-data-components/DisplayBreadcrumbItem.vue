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
 * @skill-description 面包屑导航项，基于 el-breadcrumb-item 定义单个导航节点，支持链接跳转。
 */
import { useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  label?: string
  to?: string | object
  replace?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-breadcrumb-item',
  replace: false,
})

const { isVisible } = useSparkPageComponent(props)
</script>
