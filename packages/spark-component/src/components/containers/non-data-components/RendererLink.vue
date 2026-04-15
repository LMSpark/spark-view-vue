<template>
  <el-link
    v-if="isVisible"
    :type="linkType"
    :underline="underline"
    :disabled="isDisabled"
    :href="href"
    :target="target"
    v-bind="hostProps"
  >
    {{ label }}
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-link-child-${index}`"
      :config="child"
    />
  </el-link>
</template>

<script setup lang="ts">
/**
 * @skill r-link
 * @description 链接组件，可渲染子内容。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RLinkProps } from './RendererLink.props'



const props = withDefaults(defineProps<RLinkProps>(), {
  type: 'r-link',
  linkType: 'default',
  underline: true,
  target: '_self',
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


