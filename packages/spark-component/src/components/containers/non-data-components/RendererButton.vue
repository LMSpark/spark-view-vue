<template>
  <el-button
    v-if="isVisible"
    v-bind="$attrs"
    :type="resolved.buttonType"
    :size="resolved.buttonSize"
    :plain="resolved.plain"
    :text="resolved.text"
    :bg="bg"
    :link="resolved.link"
    :round="resolved.round"
    :circle="resolved.circle"
    :loading="loading"
    :disabled="isDisabled"
    :icon="resolvedIcon"
    :auto-insert-space="autoInsertSpace"
    :color="color"
    :dark="dark"
  >
    {{ resolved.label }}
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-button-child-${index}`"
      :config="child"
    />
  </el-button>
</template>

<script setup lang="ts">
/**
 * @skill-description 按钮组件，基于 el-button 可渲染子内容。
 * 支持 action（CRUD 动作）+ template（样式预设）+ 显式 props 三层样式合并。
 */
import { computed, markRaw, type Component } from 'vue'
import * as ElIcons from '@element-plus/icons-vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'
import { resolveButtonStyle } from '../button-templates'

interface Props extends SparkNode {
  children?: SparkNode[]
  /** CRUD 动作名（如 'refresh', 'delete-row'），由容器自动绑定处理器 */
  action?: string
  /** 样式模板名（如 'primary', 'toolbar-danger', 'icon-add'） */
  template?: string
  label?: string
  buttonType?: string
  buttonSize?: string
  plain?: boolean
  text?: boolean
  bg?: boolean
  link?: boolean
  round?: boolean
  circle?: boolean
  loading?: boolean
  icon?: string
  autoInsertSpace?: boolean
  color?: string
  dark?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-button',
  bg: false,
  loading: false,
  autoInsertSpace: false,
  dark: false,
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const resolved = computed(() => {
  const explicit: Record<string, unknown> = {}
  if (props.buttonType !== undefined) explicit['buttonType'] = props.buttonType
  if (props.buttonSize !== undefined) explicit['buttonSize'] = props.buttonSize
  if (props.plain !== undefined) explicit['plain'] = props.plain
  if (props.text !== undefined) explicit['text'] = props.text
  if (props.link !== undefined) explicit['link'] = props.link
  if (props.round !== undefined) explicit['round'] = props.round
  if (props.circle !== undefined) explicit['circle'] = props.circle
  if (props.icon !== undefined) explicit['icon'] = props.icon
  if (props.label !== undefined) explicit['label'] = props.label
  return resolveButtonStyle(props.action, props.template, explicit)
})

const resolvedIcon = computed((): Component | null => {
  const name = resolved.value.icon
  if (!name) return null
  const icons = ElIcons as Record<string, Component>
  const comp = icons[name]
  return comp ? markRaw(comp) : null
})

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
