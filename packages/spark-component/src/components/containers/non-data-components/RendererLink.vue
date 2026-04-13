<template>
  <el-link
    v-if="isVisible"
    :type="linkType"
    :underline="underline"
    :disabled="isDisabled"
    :href="href"
    :target="target"
    v-bind="$attrs"
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
 * @description 链接组件，基于 el-link 提供带样式的超链接，可渲染子内容。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface RendererLinkProps {
  type?: 'r-link'
  children?: SparkNode[]
  label?: string
  linkType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  underline?: boolean
  href?: string
  target?: '_blank' | '_self' | '_parent' | '_top'
}

const props = withDefaults(defineProps<RendererLinkProps>(), {
  type: 'r-link',
  linkType: 'default',
  underline: true,
  target: '_self',
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
