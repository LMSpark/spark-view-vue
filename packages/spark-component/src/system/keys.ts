/**
 * @module @spark-appworks/spark-component:system/keys
 * @spark-appworks/spark-component 的 system/keys 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import type { InjectionKey } from 'vue'
import type { ComponentRegistry } from '../core/types.js'

/** 组件注册表注入键 */
export const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry> = Symbol('sparkRegistry')
