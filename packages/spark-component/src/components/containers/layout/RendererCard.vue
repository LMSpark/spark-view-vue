<template>
  <el-card
    v-if="isVisible"
    :shadow="shadow"
    :body-style="bodyStyle"
    :body-class="bodyClass"
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
 * @description 卡片容器，在卡片体内渲染子组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RCardProps } from './RendererCard.props'



const props = withDefaults(defineProps<RCardProps>(), {
  type: 'r-card',
  shadow: 'always',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


