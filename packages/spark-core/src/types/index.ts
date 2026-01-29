import type { UnwrapRef } from 'vue'

export interface AsyncState<T = any> {
  data?: UnwrapRef<Awaited<T>>
  loading: boolean
  error?: Error
}

export * from './spark-component.js'
