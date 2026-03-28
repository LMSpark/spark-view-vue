import {
  isDefaultBehaviorControl,
  type DefaultBehaviorControl,
} from '../../internal/defaultBehaviorControl'

/**
 * 从事件参数中提取默认行为控制器。
 *
 * 容器事件、字段事件、action 链式执行统一复用同一个 `{ cancel: boolean }` 结构，
 * 这里集中做最小鸭型识别，避免绑定层和执行器各自维护一份实现。
 */
export function extractActionExecutionControl(
  eventArgs?: readonly unknown[],
): DefaultBehaviorControl | undefined {
  if (!Array.isArray(eventArgs) || eventArgs.length === 0) return undefined
  const last: unknown = eventArgs[eventArgs.length - 1]
  if (isDefaultBehaviorControl(last)) {
    return last
  }
  return undefined
}
