/**
 * 能力系统核心类型
 *
 * 设计理念：
 * - 能力是上下文接口，通过名称解耦
 * - 实现类型 T 可为任意值（对象、函数、事件发射器等）
 * - Provider/Consumer 提供统一的管理抽象
 */

/** 能力名称类型（支持 string 和 Symbol） */
export type CapabilityName = string | symbol

/**
 * 能力提供者
 * @template T 能力实现的类型
 */
export interface Provider<T = unknown> {
  /** 能力名称（唯一标识，支持 string 和 Symbol） */
  name: CapabilityName
  /** 能力实现 */
  implementation?: T
}

/**
 * 能力消费者
 * @template T 能力实现的类型
 */
export interface Consumer<T = unknown> {
  /** 需要的能力名称（支持 string 和 Symbol） */
  capabilityName: CapabilityName
  /** 连接后会被赋值为 Provider.implementation */
  implementation?: T
}
