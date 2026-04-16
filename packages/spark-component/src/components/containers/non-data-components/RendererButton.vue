<template>
  <el-button
    v-if="isVisible"
    v-bind="hostProps"
    :type="resolved.buttonType"
    :size="resolved.buttonSize"
    :plain="resolved.plain"
    :text="resolved.text"
    :bg="bg"
    :link="resolved.link"
    :round="resolved.round"
    :circle="resolved.circle"
    :loading="loading"
    :disabled="effectiveDisabled"
    :icon="resolvedIcon"
    :auto-insert-space="autoInsertSpace"
    :color="color"
    :dark="dark"
    @click="handleClick"
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
 * @skill r-button
 * @description 声明式动作按钮，支持 action（CRUD 动作）+ template（样式预设）+ 显式 props 三层样式合并。
 * @category container
 * @binding action
 * @notes 常用 action: append-row, refresh, patch-row, delete-row, delete-selected, message-row
 * @notes dock='toolbar' 放置工具栏；dock='actions' 放置行操作
 */
import { computed, markRaw, type Component } from 'vue'
import * as ElIcons from '@element-plus/icons-vue'
import {
  ACTION_CAPABILITY,
  HOST_VARIANT,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
  useSparkPageComponent,
  type SparkNode,
} from '../../internal'
import { isBuiltinAction } from '../support/actions/builtin-action-meta'
import { resolveButtonStyle } from '../support/actions/button-templates'
import type { RButtonProps } from './RendererButton.props'

const props = withDefaults(defineProps<RButtonProps>(), {
  type: 'r-button',
  bg: false,
  loading: false,
  autoInsertSpace: false,
  dark: false,
})

const { isVisible, isDisabled, resolvedProps, sparkConsume } = useSparkPageComponent(props)

const currentNode = computed<SparkNode>(() => ({
  type: props.type,
  props: resolvedProps.value,
  ...(props.children !== undefined ? { children: props.children } : {}),
}))

const hasBuiltinAction = computed(() => isBuiltinAction(currentNode.value))

// @spark-design: 动态查询最近宿主，确保响应 Host 能力变化（如行操作禁用状态更新）
// nearestHost 在 Host 能力改变时需要重新查询，不能缓存
const hostActionDisabled = computed(() => {
  if (!hasBuiltinAction.value) return false
  const actionHost = sparkConsume(ACTION_CAPABILITY)
  return actionHost !== null ? actionHost.isDisabled(currentNode.value) : false
})

const effectiveDisabled = computed(() => isDisabled.value || hostActionDisabled.value)

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
  // 动态读取宿主变体能力，确保响应上层语义变化
  if (hasBuiltinAction.value) {
    if (sparkConsume(HOST_VARIANT) === 'row-action') {
      if (explicit['buttonSize'] === undefined) explicit['buttonSize'] = 'small'
      if (explicit['text'] === undefined) explicit['text'] = true
    }
  }
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

function handleClick() {
  if (!hasBuiltinAction.value) return
  const actionHost = sparkConsume(ACTION_CAPABILITY)
  if (actionHost === null) return
  actionHost.execute(currentNode.value)
}
</script>

