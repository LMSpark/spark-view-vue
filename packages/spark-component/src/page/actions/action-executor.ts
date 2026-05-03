/**
 * Action Descriptor 执行引擎（单一真源）
 *
 * 解析并执行声明式 action descriptor，提供框架无关的行为执行能力。
 * 由 normalizeRuleEvents（on 事件）、容器 wrapper 区域（如 r-toolbar）以及
 * SparkNode 翻译器（nodeToActionDescriptor）共同使用。
 */

import type {
  ActionDescriptor,
  ActionExecutionContext,
  ActionExecutionControl,
  ActionExecutionScope,
  ActionUiDecorator,
  ShowMessageAction,
  ShowConfirmAction,
  ShowAlertAction,
  NavigateAction,
  OpenAction,
} from './action-types'
import { isCancellableControl, type CancellableControl } from '../../components/containers/support/interactionControl.js'
import { Logger } from '@spark-view/spark-utils'
import type { IDataRow } from '@spark-view/spark-data'
import type { PageMessageType } from '../../components/internal'
import { extractErrorMessage, interpolate, createActionNotifier, isRowLike } from './executor-helpers'

import {
  executeAppendRow,
  executeDelete,
  executePatch,
  executeMove,
  executeMessageRow,
  executeRefresh,
  executeClearRows,
  executeSetField,
  executeSubmitCurrentForm,
} from './action-data'

// ── UI 单一动作执行器 ──────────────────────────────────────────────────

function executeShowMessage(desc: ShowMessageAction, ctx: ActionExecutionContext): void {
  const ps = ctx.getPageService()
  if (ps) ps.showMessage(desc.message, desc.messageType ?? 'info')
}

async function executeAlert(desc: ShowAlertAction, ctx: ActionExecutionContext): Promise<void> {
  const ps = ctx.getPageService()
  if (ps) await ps.showAlert(desc.message, desc.title, {})
}

async function executeConfirm(
  desc: ShowConfirmAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
  eventArgs: unknown[] | undefined,
  control: ActionExecutionControl | undefined,
  runChild: (
    next: ActionDescriptor,
    ctx: ActionExecutionContext,
    scope: ActionExecutionScope | undefined,
    eventArgs: unknown[] | undefined,
    control: ActionExecutionControl | undefined,
  ) => Promise<void>,
): Promise<void> {
  const ps = ctx.getPageService()
  if (!ps) return

  const opts: { type?: PageMessageType } = {}
  if (desc.confirmType) opts.type = desc.confirmType

  const confirmed = await ps.showConfirm(desc.message, desc.title ?? '确认', opts)
  const nestedControl = control ?? extractActionExecutionControl(eventArgs)

  if (confirmed && desc.onConfirm) {
    await runChild(desc.onConfirm, ctx, scope, eventArgs, nestedControl)
  } else if (!confirmed && desc.onCancel) {
    await runChild(desc.onCancel, ctx, scope, eventArgs, nestedControl)
  }
}

function executeNavigate(
  desc: NavigateAction,
  ctx: ActionExecutionContext,
  eventArgs?: unknown[],
): void {
  const router = ctx.getRouter()
  if (!router) return

  let path = desc.path
  if (path.includes('{')) {
    const eventRow = eventArgs?.[0]
    const rowFromEvent: IDataRow | null = isRowLike(eventRow) ? eventRow : null
    path = interpolate(path, {}, rowFromEvent)
  }

  void router.push(path)
}

function executeOpen(desc: OpenAction): void {
  const event = new CustomEvent('spark:open', { detail: { target: desc.target }, bubbles: true })
  document.dispatchEvent(event)
}

const logger = Logger('action-executor')

export interface ActionExecutionOptions {
  eventArgs?: unknown[]
  control?: ActionExecutionControl
  scope?: ActionExecutionScope
}

/**
 * 执行单个 action descriptor。
 */
export async function executeActionDescriptor(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
  eventArgsOrOptions?: unknown[] | ActionExecutionOptions,
  scope?: ActionExecutionScope,
): Promise<void> {
  const options = Array.isArray(eventArgsOrOptions)
    ? { eventArgs: eventArgsOrOptions }
    : (eventArgsOrOptions ?? {})

  const eventArgs = options.eventArgs
  const control = options.control
  const effectiveScope = scope ?? options.scope

  if (descriptor.cancelDefault && control) {
    control.cancel = true
  }

  try {
    await dispatchAction(descriptor, ctx, effectiveScope, eventArgs, control)
  } catch (error) {
    handleTopLevelError(descriptor, ctx, error)
    return
  }

  if (descriptor.then) {
    const opts: ActionExecutionOptions = {}
    if (eventArgs !== undefined) opts.eventArgs = eventArgs
    if (control !== undefined) opts.control = control
    if (effectiveScope !== undefined) opts.scope = effectiveScope
    await executeActionDescriptor(descriptor.then, ctx, opts)
  }
}

function decoratorOf(descriptor: ActionDescriptor): ActionUiDecorator | undefined {
  return descriptor as ActionUiDecorator
}

function handleTopLevelError(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
  error: unknown,
): void {
  const decorator = decoratorOf(descriptor)
  const detail = extractErrorMessage(error)
  const fallback = decorator?.errorMessage
    ? interpolate(decorator.errorMessage, {}, null)
    : `${descriptor.action}失败`
  const message = detail.length > 0 ? `${fallback}: ${detail}` : fallback
  const notifier = createActionNotifier(ctx, decorator)
  notifier.notifyError(message)
  if (import.meta.env.DEV) {
    logger.warn(`action 执行失败 action=${descriptor.action} message=${message}`)
  }
}

async function dispatchAction(
  descriptor: ActionDescriptor,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
  eventArgs: unknown[] | undefined,
  control: ActionExecutionControl | undefined,
): Promise<void> {
  switch (descriptor.action) {
    case 'show-message':
      executeShowMessage(descriptor, ctx)
      return
    case 'confirm':
      await executeConfirm(
        descriptor,
        ctx,
        scope,
        eventArgs,
        control,
        async (next, c, s, e, ctrl) => {
          const opts: ActionExecutionOptions = {}
          if (e !== undefined) opts.eventArgs = e
          if (ctrl !== undefined) opts.control = ctrl
          if (s !== undefined) opts.scope = s
          await executeActionDescriptor(next, c, opts)
        },
      )
      return
    case 'alert':
      await executeAlert(descriptor, ctx)
      return
    case 'navigate':
      executeNavigate(descriptor, ctx, eventArgs)
      return
    case 'open':
      executeOpen(descriptor)
      return
    case 'set-field':
      await executeSetField(descriptor, ctx)
      return
    case 'append-row':
      await executeAppendRow(descriptor, ctx, scope)
      return
    case 'delete':
      await executeDelete(descriptor, ctx, scope)
      return
    case 'patch':
      await executePatch(descriptor, ctx, scope)
      return
    case 'move':
      await executeMove(descriptor, ctx, scope)
      return
    case 'message-row':
      executeMessageRow(descriptor, ctx, scope)
      return
    case 'refresh':
      await executeRefresh(descriptor, ctx)
      return
    case 'clear-rows':
      await executeClearRows(descriptor, ctx)
      return
    case 'submit-current-form':
      await executeSubmitCurrentForm(descriptor, ctx, scope)
      return
    default: {
      const exhaustive: never = descriptor
      logger.warn(`未知 action 类型: ${(exhaustive as { action: string }).action}`)
    }
  }
}

export function extractActionExecutionControl(
  eventArgs?: readonly unknown[],
): CancellableControl | undefined {
  if (!Array.isArray(eventArgs) || eventArgs.length === 0) return undefined
  const last: unknown = eventArgs[eventArgs.length - 1]
  if (isCancellableControl(last)) return last
  return undefined
}
