<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayEmpty
DisplayEmpty 模块，属于 SPARK component display/static-display。
组件目录: display/non-data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-empty
    v-if="isVisible"
    :image="image"
    :image-size="imageSize"
    :description="description"
  >
    <template v-if="resolvedChildren.length > 0">
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-empty-child-${index}`"
        :config="child"
      />
    </template>
  </el-empty>
</template>

<script setup lang="ts">
/**
 * @description 空状态占位组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { REmptyProps } from './DisplayEmpty.props'

const props = withDefaults(defineProps<REmptyProps>(), {
  type: 'r-empty',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


