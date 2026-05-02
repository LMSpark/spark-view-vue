/**
 * 可取消控制器 — 事件处理流程控制信号。
 * 用于动作执行、字段变化、容器交互等场景允许处理函数拒绝默认操作。
 */

export interface CancellableControl {
  cancel: boolean
}

export function createCancellableControl(): CancellableControl {
  return { cancel: false }
}

export function isCancellableControl(value: unknown): value is CancellableControl {
  return value !== null
    && value !== undefined
    && typeof value === 'object'
    && 'cancel' in value
    && typeof (value as Record<string, unknown>)['cancel'] === 'boolean'
}
