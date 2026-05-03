/**
 * UI 单一动作执行器：show-message / alert / confirm / navigate / open
 */

import type {
  ActionDescriptor,
  ActionExecutionContext,
  ActionExecutionScope,
  ActionExecutionControl,
  ShowMessageAction,
  ShowConfirmAction,
  ShowAlertAction,
  NavigateAction,
  OpenAction,
} from '../action-types'
import type { IDataRow } from '@spark-view/spark-data'
import { interpolate, isRowLike } from '../executor-helpers'
import { extractActionExecutionControl } from '../action-executor'
import type { PageMessageType } from '../../../core/capability-system.js'

export function executeShowMessage(desc: ShowMessageAction, ctx: ActionExecutionContext): void {
  const ps = ctx.getPageService()
  if (ps) ps.showMessage(desc.message, desc.messageType ?? 'info')
}

export async function executeAlert(desc: ShowAlertAction, ctx: ActionExecutionContext): Promise<void> {
  const ps = ctx.getPageService()
  if (ps) await ps.showAlert(desc.message, desc.title, {})
}

export async function executeConfirm(
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

export function executeNavigate(
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

export function executeOpen(desc: OpenAction): void {
  const event = new CustomEvent('spark:open', { detail: { target: desc.target }, bubbles: true })
  document.dispatchEvent(event)
}
