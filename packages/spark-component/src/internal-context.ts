import type { InjectionKey } from 'vue'
import type { SparkCapabilityContext } from './types.js'

export const INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY: InjectionKey<SparkCapabilityContext> = Symbol('sparkParentCapabilityContext') as InjectionKey<SparkCapabilityContext>