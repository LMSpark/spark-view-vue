import type { InjectionKey } from 'vue'
import type { SparkCapabilityContext } from '../types.js'

/**
 * renderer / plugin / composable 之间共享的内部父能力上下文注入键。
 *
 * 该文件位于 `internal/` 下，避免根目录继续累积“只给内部使用”的杂项文件。
 */
export const INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY: InjectionKey<SparkCapabilityContext> = Symbol('sparkParentCapabilityContext') as InjectionKey<SparkCapabilityContext>