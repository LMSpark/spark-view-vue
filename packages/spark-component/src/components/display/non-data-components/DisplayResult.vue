<template>
  <el-result
    v-if="isVisible"
    :icon="icon"
    :title="title"
    :sub-title="subTitle"
    v-bind="$attrs"
  >
    <template v-if="resolvedChildren.length > 0" #extra>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-result-child-${index}`"
        :config="child"
      />
    </template>
  </el-result>
</template>

<script setup lang="ts">
/**
 * @skill-description 结果页组件，基于 el-result 显示操作结果状态（成功/警告/信息/错误），含标题、副标题和按钮区。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  icon?: 'success' | 'warning' | 'info' | 'error'
  title?: string
  subTitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-result',
  icon: 'info',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
