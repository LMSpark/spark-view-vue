<template>
  <el-page-header
    v-if="isVisible"
    :title="title"
    :icon="icon"
    :content="content"
    @back="$emit('back')"
  >
    <template v-if="resolvedChildren.length" #default>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-page-header-child-${index}`"
        :config="child"
      />
    </template>
  </el-page-header>
</template>

<script setup lang="ts">
/**
 * @skill r-page-header
 * @description 页面头部组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RPageHeaderProps } from './RendererPageHeader.props'



const props = withDefaults(defineProps<RPageHeaderProps>(), {
  type: 'r-page-header',
  title: '返回',
})

defineEmits<{
  /** Back requested; 用户点击页头返回入口。 */
  back: []
}>()

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


