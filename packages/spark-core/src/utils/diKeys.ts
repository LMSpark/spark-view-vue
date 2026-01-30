import type { InjectionKey } from 'vue'
import type { ComponentManager, ComponentRegistry } from '../types/spark-component.js'

export const SPARK_MANAGER_KEY: InjectionKey<ComponentManager> = Symbol('sparkManager') as unknown as InjectionKey<ComponentManager>
export const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry> = Symbol('sparkRegistry') as unknown as InjectionKey<ComponentRegistry> 
