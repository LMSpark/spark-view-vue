/**
 * 动作执行消息中心：统一处理 silent / 多级文案 / pageService fail-soft。
 */

import type { ActionExecutionContext, ActionUiDecorator } from './action-descriptor'
import type { PageMessageType } from '../../core/capability-system.js'
import { Logger } from '@spark-view/spark-utils'

const logger = Logger('action-executor')

export interface ActionNotifier {
  /** 发送装饰文案；silent 则吞掉 */
  notify(type: PageMessageType, message: string): void
  /** 发送 error（无视 silent） */
  notifyError(message: string): void
}

export function createActionNotifier(
  ctx: ActionExecutionContext,
  decorator: ActionUiDecorator | undefined,
): ActionNotifier {
  const silent = decorator?.silent === true

  function send(type: PageMessageType, message: string): void {
    if (message.trim().length === 0) return
    const ps = ctx.getPageService()
    if (ps) {
      ps.showMessage(message, type)
      return
    }
    if (import.meta.env.DEV) {
      logger.warn(`PAGE_SERVICE 不可用，消息未展示: ${message}`)
    }
  }

  return {
    notify(type, message) {
      if (silent) return
      send(type, message)
    },
    notifyError(message) {
      send('error', message)
    },
  }
}

/**
 * 统一确认：返回 true 表示通过（无 confirmMessage 也直通）。
 */
export async function confirmIfNeeded(
  ctx: ActionExecutionContext,
  decorator: ActionUiDecorator | undefined,
  fallbackMessage: string,
  fallbackTitle: string,
): Promise<boolean> {
  const ps = ctx.getPageService()
  if (!ps) return true

  const rawMessage = decorator?.confirmMessage
  // 显式空字符串：跳过确认
  if (rawMessage === '') return true
  const message = rawMessage ?? fallbackMessage
  if (message.trim().length === 0) return true

  const title = decorator?.confirmTitle ?? fallbackTitle
  const opts: { type?: PageMessageType } = {}
  if (decorator?.confirmType) opts.type = decorator.confirmType
  return await ps.showConfirm(message, title, opts)
}
