/**
 * 能力系统核心类型
 *
 * 设计理念：
 * - 能力是上下文接口，通过名称解耦
 * - 实现类型 T 可为任意值（对象、函数、事件发射器等）
 * - Provider/Consumer/Context 提供统一的管理抽象
 */

/**
 * 能力提供者
 * @template T 能力实现的类型
 */
export interface Provider<T = unknown> {
  /** 能力名称（唯一标识） */
  name: string
  /** 能力实现 */
  implementation?: T
}

/**
 * 能力消费者
 * @template T 能力实现的类型
 */
export interface Consumer<T = unknown> {
  /** 需要的能力名称 */
  capabilityName: string
  /** 连接后会被赋值为 Provider.implementation */
  implementation?: T
}

/**
 * 能力上下文 - 能力容器
 *
 * 核心特性：
 * - 上下文仅作为能力容器，不包含业务数据
 * - 通过 parent 链实现能力向上查找
 * - 使用 this 类型支持子类型继承
 *
 * @template T 能力类型，默认为 Provider
 *
 * @example
 * ```typescript
 * // 创建上下文
 * const ctx: Context = { providers: new Map() }
 *
 * // 注册能力
 * provide(ctx, 'config', { apiUrl: 'xxx' })
 *
 * // 消费能力
 * const config = consume<{ apiUrl: string }>(ctx, 'config')
 * ```
 */
export interface Context<T = Provider> {
  /** 父上下文（使用 this 类型支持子类型继承） */
  parent?: this | Context<T>
  /** 当前上下文提供的能力（Map 实现 O(1) 查询） */
  providers: Map<string, T>
}

/**
 * 注册能力
 *
 * 自动将实现包装为 Provider 结构并注册到上下文
 *
 * @template T 能力实现类型
 * @param context 目标上下文
 * @param name 能力名称（唯一标识）
 * @param implementation 能力实现
 *
 * @example
 * ```typescript
 * provide(context, 'userService', userServiceInstance)
 * provide(context, 'config', { apiUrl: 'https://api.example.com' })
 * ```
 */
export function provide<T = unknown>(
  context: Context<Provider>,
  name: string,
  implementation: T
): void {
  context.providers.set(name, {
    name,
    implementation
  })
}

/**
 * 消费能力（当前层）
 *
 * 仅从当前上下文查找能力，不向上搜索
 *
 * @template T 能力实现类型
 * @param context 目标上下文
 * @param name 能力名称
 * @returns 能力实现，未找到时返回 undefined
 *
 * @example
 * ```typescript
 * const config = consume<AppConfig>(context, 'config')
 * if (config) {
 *   console.log(config.apiUrl)
 * }
 * ```
 */
export function consume<T = unknown>(
  context: Context<Provider>,
  name: string
): T | undefined {
  const provider = context.providers.get(name)
  return provider?.implementation as T | undefined
}

/**
 * 消费能力（向上查找）
 *
 * 沿 parent 链向上查找能力，实现能力继承
 *
 * @template T 能力实现类型
 * @param context 起始上下文
 * @param name 能力名称
 * @returns 能力实现，未找到时返回 undefined
 *
 * @example
 * ```typescript
 * // 从组件上下文查找，会自动向上搜索 component → page → app
 * const user = consumeInherited<User>(componentContext, 'currentUser')
 * ```
 */
export function consumeInherited<T = unknown>(
  context: Context<Provider>,
  name: string
): T | undefined {
  let current: Context<Provider> | undefined = context

  while (current) {
    const provider = current.providers.get(name)
    if (provider?.implementation !== undefined) {
      return provider.implementation as T
    }
    current = current.parent
  }

  return undefined
}

/**
 * 获取 Provider（当前层）
 *
 * 返回完整的 Provider 对象，而非只是 implementation
 *
 * @param context 目标上下文
 * @param name 能力名称
 * @returns Provider 对象，未找到时返回 undefined
 */
export function getProvider(
  context: Context<Provider>,
  name: string
): Provider | undefined {
  return context.providers.get(name)
}

/**
 * 获取 Provider（向上查找）
 *
 * 沿 parent 链向上查找，返回完整的 Provider 对象
 *
 * @param context 起始上下文
 * @param name 能力名称
 * @returns Provider 对象，未找到时返回 undefined
 *
 * @example
 * ```typescript
 * const provider = getProviderInherited(context, 'dataService')
 * if (provider) {
 *   console.log(provider.name, provider.implementation)
 * }
 * ```
 */
export function getProviderInherited(
  context: Context<Provider>,
  name: string
): Provider | undefined {
  let current: Context<Provider> | undefined = context

  while (current) {
    const provider = current.providers.get(name)
    if (provider) {
      return provider
    }
    current = current.parent
  }

  return undefined
}
