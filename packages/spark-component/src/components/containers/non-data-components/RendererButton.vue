<template>
  <el-button
    v-if="effectiveVisible"
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
  DATA_ROW,
  DATA_SOURCE,
  PAGE_DATASET,
  PAGE_SERVICE,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
  useSparkPageComponent,
  type SparkNode,
} from '../../internal'
import {
  isBuiltinAction,
  nodeToActionDescriptor,
  executeActionDescriptor,
  type ActionExecutionScope,
} from '../../../page/actions'
import { resolveButtonStyle } from '../../../page/actions/index'
import type { RButtonProps } from './RendererButton.props'
import { extractModelPermission, usePermission } from '../../../permission'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import { isBuiltinActionDisabled } from '../../../page/actions/index'

const props = withDefaults(defineProps<RButtonProps>(), {
  type: 'r-button',
  bg: false,
  loading: false,
  autoInsertSpace: false,
  dark: false,
})

// ── 一、基础能力与上下文 ─────────────────────────────────────────────────
// useSparkPageComponent 负责接入可见性、禁用态、规范化 props 以及 capability 消费入口。
const { isVisible, isDisabled, resolvedProps, sparkConsume, logger } = useSparkPageComponent(props)
// 权限能力用于模型级与行级动作授权判断。
const permission = usePermission()

// ── 二、动作节点建模 ─────────────────────────────────────────────────────
// 将按钮自身映射为统一 SparkNode，后续权限/宿主动作都基于这个节点执行。
const currentNode = computed<SparkNode>(() => ({
  type: props.type,
  props: resolvedProps.value,
  ...(props.children !== undefined ? { children: props.children } : {}),
}))

// 仅内置动作（例如 refresh/delete-current）才需要介入宿主禁用裁决。
const hasBuiltinAction = computed(() => isBuiltinAction(currentNode.value))

function resolveActionView(): DataView | null {
  const dataSource = sparkConsume(DATA_SOURCE)
  return dataSource as DataView | null
}

// 统一解析作用域行：优先 DATA_ROW；若不存在则回退到 DATA_SOURCE.currentRow。
// 这样可同时覆盖行内按钮与工具栏按钮。
function resolveScopedRow(): IDataRow | undefined {
  const dataSource = sparkConsume(DATA_SOURCE)
  const dataRow = sparkConsume(DATA_ROW)
  return (dataRow ?? ((dataSource as { currentRow?: IDataRow } | null)?.currentRow)) ?? undefined
}

// 解析权限判定的作用域行集合。
// 工具栏（无 DATA_ROW）+ DataView 多选模式：绑定到 selectedRows，行级权限要求每行都允许。
// 其他场景（行内按钮 / 单选）：退化为单行（DATA_ROW 或 currentRow）。
function resolvePermissionScopeRows(): IDataRow[] {
  const dataRow = sparkConsume(DATA_ROW)
  if (dataRow !== null && dataRow !== undefined && typeof dataRow === 'object' && !Array.isArray(dataRow)) {
    return [dataRow as IDataRow]
  }

  const dataSource = sparkConsume(DATA_SOURCE) as DataView | null
  if (dataSource && dataSource.isMultiSelect === true) {
    const selected = dataSource.selectedRows ?? []
    return selected.length > 0 ? selected.slice() : []
  }

  const currentRow = (dataSource as { currentRow?: IDataRow } | null)?.currentRow
  return currentRow !== null && currentRow !== undefined ? [currentRow] : []
}

// ── 三、宿主动作禁用态（内置动作） ──────────────────────────────────────
// 内置动作的禁用态由 view 调用 isBuiltinActionDisabled 进行裁决（例如 DataView 行态/选择态）。
const hostActionDisabled = computed(() => {
  if (!hasBuiltinAction.value) return false
  const view = resolveActionView()
  if (!view) return false

  // 将 DATA_SOURCE / DATA_ROW 显式并入动作节点，保证裁决拿到完整作用域。
  const nodeForCheck = resolveActionNodeWithDataCapabilities()
  const row = resolveScopedRow()
  return isBuiltinActionDisabled(nodeForCheck, view, row ? { row, index: 0 } : undefined)
})

// ── 四、权限判定与可见/禁用策略 ─────────────────────────────────────────
// permissionAllowed 仅做授权判定，不负责组件最终的显示和禁用。
// 节点未声明 permAction 且非内置动作时，isModel/RowActionAllowed 直接返回 true（基线允许）。
// 多选模式下的工具栏：绑定到 selectedRows，行级动作要求每行都允许（任一被拒即整体拒）。
const permissionAllowed = computed(() => {
  const dataSource = sparkConsume(DATA_SOURCE)
  const modelPerm = extractModelPermission(dataSource)

  if (!permission.isModelActionAllowed(currentNode.value, modelPerm)) return false

  const scopeRows = resolvePermissionScopeRows()
  if (scopeRows.length === 0) {
    return permission.isRowActionAllowed(currentNode.value, undefined)
  }
  return scopeRows.every((row) => permission.isRowActionAllowed(currentNode.value, row))
})

// 拒绝策略：hide 表示隐藏；disable 表示保留展示但不可点击。
const permissionDeniedMode = computed<'disable' | 'hide'>(() => {
  const mode = resolvedProps.value['permissionDeniedMode']
  return mode === 'hide' ? 'hide' : 'disable'
})

// 最终可见性：先看组件自身显示条件，再叠加权限策略。
const effectiveVisible = computed(() => {
  if (!isVisible.value) return false
  if (permissionAllowed.value) return true
  return permissionDeniedMode.value !== 'hide'
})

// 最终禁用态：权限拒绝且策略为 disable 时强制禁用；否则叠加自身与宿主禁用态。
const effectiveDisabled = computed(() => {
  if (!permissionAllowed.value && permissionDeniedMode.value === 'disable') {
    return true
  }
  return isDisabled.value || hostActionDisabled.value
})

// ── 五、动作节点作用域补全 ─────────────────────────────────────────────
// 为内置动作执行补齐 dataSource/row，保持裁决与执行入参稳定。
function resolveActionNodeWithDataCapabilities(): SparkNode {
  const dataSource = sparkConsume(DATA_SOURCE)
  const dataRow = resolveScopedRow()

  if (dataSource === null && dataRow === null) {
    return currentNode.value
  }

  return {
    ...currentNode.value,
    props: {
      ...(currentNode.value.props ?? {}),
      ...(dataSource !== null ? { dataSource } : {}),
      ...(dataRow !== null ? { row: dataRow } : {}),
    },
  }
}

async function executeBuiltinActionDirect(action: SparkNode): Promise<void> {
  const descriptor = nodeToActionDescriptor(action)
  if (!descriptor) {
    logger.warn(`r-button 内置动作未识别: ${String(action.props?.['action'])}`)
    return
  }
  const dataRow = sparkConsume(DATA_ROW)
  const scope: ActionExecutionScope = {}
  if (dataRow !== null && dataRow !== undefined && typeof dataRow === 'object' && !Array.isArray(dataRow)) {
    scope.row = dataRow as IDataRow
  }
  const ctx = {
    getDataSet: () => sparkConsume(PAGE_DATASET),
    getPageService: () => sparkConsume(PAGE_SERVICE),
    getRouter: () => null,
  }
  await executeActionDescriptor(descriptor, ctx, undefined, scope)
}

// ── 六、视觉样式解析 ─────────────────────────────────────────────────────
// 显式 props 优先，action/template 为兜底与预设来源。
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

// icon 名称字符串转换为 Element Plus 图标组件。
const resolvedIcon = computed((): Component | null => {
  const name = resolved.value.icon
  if (!name) return null
  const icons = ElIcons as Record<string, Component>
  const comp = icons[name]
  return comp ? markRaw(comp) : null
})

// children 统一规范化，避免模板层处理原始 mixed children。
const resolvedChildren = computed(() => getSparkNodeChildren(props.children))

// ── 七、业务 click 处理器解析 ───────────────────────────────────────────
// 支持 props.on.click 和 props.onClick 两种声明式入口。
const resolvedOnClick = computed<((...args: unknown[]) => unknown) | null>(() => {
  const on = resolvedProps.value['on']
  if (on !== null && typeof on === 'object' && !Array.isArray(on)) {
    const click = (on as Record<string, unknown>)['click']
    if (typeof click === 'function') return click as (...args: unknown[]) => unknown
  }

  const onClick = resolvedProps.value['onClick']
  if (typeof onClick === 'function') return onClick as (...args: unknown[]) => unknown
  return null
})

// ── 八、点击执行流 ─────────────────────────────────────────────────────
// 执行优先级：
// 1. 内置动作：必须上游存在容器提供的 DATA_SOURCE，由 view 直驱执行。
// 2. 普通按钮：调用业务 onClick，并在有作用域行时透传 row。
async function handleClick(event: MouseEvent): Promise<void> {
  if (hasBuiltinAction.value) {
    if (!resolveActionView()) return
    const actionNode = resolveActionNodeWithDataCapabilities()
    await executeBuiltinActionDirect(actionNode)
    return
  }

  const onClick = resolvedOnClick.value
  if (!onClick) return
  const scopedRow = resolveScopedRow()
  await (scopedRow !== undefined ? onClick(scopedRow, event) : onClick(event))
}
</script>

