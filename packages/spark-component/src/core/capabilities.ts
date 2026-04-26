import type {
  ICapabilityContext,
  CapabilityKey,
} from './capability-system.js'
import {
  consumeSparkCapability,
} from './capability-system.js'
import type {
  SparkActionCapability,
} from './capability-keys.js'

export {
  PAGE_DATASET,
  DATA_SOURCE,
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
  CSS_SCOPE,
} from './capability-keys.js'

export type {
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  PageComponentRegistry,
  ModuleContextCapability,
  PageCssScopeCapability,
  SparkActionCapability,
} from './capability-keys.js'

// 关系约束：
// 1. 能力键：CapabilityKey 本身就是查询入口
// 2. provider context：本地声明该能力键的 context
// 3. 能力：挂在 provider context 上的 capability value

function hasLocalCapability<T>(ctx: ICapabilityContext, key: CapabilityKey<T>): boolean {
  return ctx.capabilities.has(key)
}

/**
 * 逐层往上查找最近的“本地声明了指定能力键”的上下文。
 *
 * 与 consume 不同：只检查每层本地 capabilities map（Map.has），
 * 返回 provider context 本身，而不是能力值。
 */
export function findNearestCapabilityProvider<T>(
  ctx: ICapabilityContext | null | undefined,
  key: CapabilityKey<T>,
  options?: { includeSelf?: boolean },
): ICapabilityContext | null {
  if (!ctx) return null
  let current: ICapabilityContext | undefined = options?.includeSelf ? ctx : ctx.parent
  while (current) {
    if (hasLocalCapability(current, key)) {
      return current
    }
    current = current.parent
  }
  return null
}

/**
 * 逐层往上查找最近的“本地声明了任一指定能力键”的上下文。
 */
export function findNearestCapabilityProviderByKeys(
  ctx: ICapabilityContext | null | undefined,
  keys: ReadonlyArray<CapabilityKey<unknown>>,
  options?: { includeSelf?: boolean },
): ICapabilityContext | null {
  if (!ctx) return null
  let current: ICapabilityContext | null = options?.includeSelf ? ctx : ctx.parent ?? null
  while (current) {
    for (const key of keys) {
      if (hasLocalCapability(current, key)) {
        return current
      }
    }
    current = current.parent ?? null
  }
  return null
}

/**
 * 从指定 provider context 读取能力。
 *
 * 这里的 provider 只是一个已定位的 context。
 * localOnly=true 时只读该 context 本地提供；否则沿其 parent 链继续消费。
 */
export function consumeCapabilityFromProvider<T>(
  provider: ICapabilityContext | null | undefined,
  key: CapabilityKey<T>,
  options?: { localOnly?: boolean },
): T | null {
  if (!provider) return null
  if (options?.localOnly) {
    return hasLocalCapability(provider, key)
      ? (provider.capabilities.get(key) as T)
      : null
  }
  return consumeSparkCapability(provider, key)
}

// ===== 宿主协议与逐层查找规则 =====

/** 创建动作能力对象（与 provider 查找解耦，通过 ACTION_CAPABILITY 注入）。 */
export function createActionCapability(actions: SparkActionCapability): SparkActionCapability {
  return Object.freeze(actions)
}

// PAGE_PERMISSION_MODE 已迁入 permission/page-permission-mode.ts（权限模块唯一维护）
