/**
 * useActionButtonRuntime — r-button 内置动作运行时 composable
 *
 * 封装：beforeRender 应用 → disabled 判断 → 执行。
 * RendererButton.vue 直接消费此 composable，不再持有任何 action 层内部逻辑。
 */

import { computed, type ComputedRef } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../support/beforeRender.js'
import { extractModelPermission } from '../../../permission/index.js'
import {
  nodeToActionDescriptor,
  executeActionDescriptor,
  isActionDescriptorDisabled,
  isBuiltinAction,
  type ActionDescriptor,
  type ActionExecutionScope,
  type ActionExecutionContext,
} from '../../../page/actions/index'
import { getActionProps, readBoolean } from '../../../page/actions/executor-helpers'
import type { SparkNode } from '../../internal'
import type { DataView, IDataRow, IDataSource } from '@spark-view/spark-data'

// ── 私有：beforeRender 解析（从 view + scope 取上下文，不从 node props 取） ──

const logger = Logger('useActionButtonRuntime')

function resolveActionNode(
  action: SparkNode,
  view: DataView | null | undefined,
  scope?: ActionExecutionScope,
): SparkNode {
  const currentRow = scope?.row ?? view?.currentRow ?? null
  const dataSource = (view ?? null) as IDataSource | null
  const state = resolveNodeBeforeRender(action, {
    row: currentRow,
    data: currentRow,
    index: scope?.index,
    dataSource,
    modelPermission: extractModelPermission(dataSource),
    host: { type: null },
  }, (message, error) => {
    logger.warn(`${message}`, error)
  })
  return mergeNodeBeforeRenderProps(action, state.propsPatch)
}

// ── 公共接口 ──────────────────────────────────────────────────────────────

export interface ActionButtonRuntimeOptions {
  /** 当前节点（来自 resolvedProps） */
  currentNode: ComputedRef<SparkNode>
  /** 解析关联 DataView */
  resolveView: () => DataView | null
  /** 解析作用域行（行内按钮 / currentRow） */
  resolveScopedRow: () => IDataRow | undefined
  /** 构造执行上下文 */
  resolveContext: () => ActionExecutionContext
  /** 日志警告 */
  warn: (msg: string) => void
}

export interface ActionButtonRuntime {
  hasBuiltinAction: ComputedRef<boolean>
  /** 当前解析后的 ActionDescriptor（null 表示非内置或未识别） */
  actionDescriptor: ComputedRef<ActionDescriptor | null>
  /** 内置动作禁用态（含 beforeRender + disabled prop + 结构状态） */
  hostActionDisabled: ComputedRef<boolean>
  /** 执行内置动作 */
  executeAction: () => Promise<void>
}

export function useActionButtonRuntime(options: ActionButtonRuntimeOptions): ActionButtonRuntime {
  const { currentNode, resolveView, resolveScopedRow, resolveContext, warn } = options

  const hasBuiltinAction = computed(() => isBuiltinAction(currentNode.value))

  const actionDescriptor = computed<ActionDescriptor | null>(() => {
    if (!hasBuiltinAction.value) return null
    const view = resolveView()
    const row = resolveScopedRow()
    const scope: ActionExecutionScope | undefined = row ? { row, index: 0 } : undefined
    const resolved = resolveActionNode(currentNode.value, view, scope)
    return nodeToActionDescriptor(resolved)
  })

  const hostActionDisabled = computed<boolean>(() => {
    if (!hasBuiltinAction.value) return false
    const view = resolveView()
    if (!view) return false

    const row = resolveScopedRow()
    const scope: ActionExecutionScope | undefined = row ? { row, index: 0 } : undefined
    const resolved = resolveActionNode(currentNode.value, view, scope)

    // 静态 disabled prop（优先）
    const propsMap = getActionProps(resolved)
    if (readBoolean(propsMap['disabled']) === true) return true

    // 语义禁用（descriptor 层）
    const descriptor = nodeToActionDescriptor(resolved)
    if (!descriptor) return false
    return isActionDescriptorDisabled(descriptor, view, scope)
  })

  async function executeAction(): Promise<void> {
    const descriptor = actionDescriptor.value
    if (!descriptor) {
      warn(`r-button 内置动作未识别: ${String(currentNode.value.props?.['action'])}`)
      return
    }
    const row = resolveScopedRow()
    const scope: ActionExecutionScope = {}
    if (row !== undefined) scope.row = row
    await executeActionDescriptor(descriptor, resolveContext(), undefined, scope)
  }

  return { hasBuiltinAction, actionDescriptor, hostActionDisabled, executeAction }
}
