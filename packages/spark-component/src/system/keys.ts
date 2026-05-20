import type { InjectionKey } from 'vue'
import type { ComponentRegistry } from '../core/types.js'

/** 组件注册表注入键 */
export const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry> = Symbol('sparkRegistry')
