// shared/composables/index.ts
// 共享的 Vue 组合式函数

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { asyncUtils, RaceController } from '../utils/asyncUtils'
import { ErrorHandler } from '../utils/errorHandler'
import { ConfigManager } from '../utils/configManager'
import { Spark } from '../../features/spark'
import type { AsyncState } from '../types'

/**
 * 异步状态管理组合式函数
 */
export function useAsyncState<T>(
  initialData?: T
): {
  state: AsyncState<T>
  execute: (operation: () => Promise<T>) => Promise<void>
  reset: () => void
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  data: T | undefined
  error: Error | undefined
} {
  const state = ref<AsyncState<T>>({
    data: initialData,
    loading: false,
    error: undefined
  })

  const execute = async (operation: () => Promise<T>): Promise<void> => {
    state.value.loading = true
    state.value.error = undefined

    try {
      const result = await operation()
      state.value.data = result
    } catch (error) {
      state.value.error = error instanceof Error ? error : new Error(String(error))
      Spark.logger().error('Async operation failed', { error: state.value.error })
    } finally {
      state.value.loading = false
    }
  }

  const reset = (): void => {
    state.value = {
      data: initialData,
      loading: false,
      error: undefined
    }
  }

  return {
    state: computed(() => state.value),
    execute,
    reset,
    isLoading: computed(() => state.value.loading),
    isSuccess: computed(() => !state.value.loading && !state.value.error),
    isError: computed(() => !!state.value.error),
    data: computed(() => state.value.data),
    error: computed(() => state.value.error)
  }
}

/**
 * 竞态安全的异步操作组合式函数
 */
export function useRaceSafe<T>(): {
  execute: (operation: () => Promise<T>) => Promise<T | undefined>
  abort: () => void
  aborted: boolean
} {
  const controller = ref<RaceController | null>(null)

  const execute = async (operation: () => Promise<T>): Promise<T | undefined> => {
    if (!controller.value) {
      controller.value = asyncUtils.createRaceController()
    }

    try {
      return await asyncUtils.raceSafe(operation, controller.value)
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation was cancelled') {
        Spark.logger().debug('Race-safe operation was cancelled')
        return undefined
      }
      throw error
    }
  }

  const abort = (): void => {
    controller.value?.abort()
  }

  return {
    execute,
    abort,
    aborted: computed(() => controller.value?.aborted ?? false)
  }
}

/**
 * 防抖组合式函数
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
): T & { cancel(): void; flush(): ReturnType<T> | undefined } {
  return asyncUtils.debounce(func, wait, options)
}

/**
 * 节流组合式函数
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useThrottle<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
): T & { cancel(): void; flush(): ReturnType<T> | undefined } {
  return asyncUtils.throttle(func, wait, options)
}

/**
 * 配置监听组合式函数
 */
export function useConfig<T>(
  key: string,
  defaultValue?: T
): {
  value: T | undefined
  setValue: (newValue: T) => void
  reset: () => void
} {
  const configManager = ConfigManager.getInstance()
  const value = ref<T | undefined>(configManager.get(key, defaultValue))

  // 监听配置变化
  const unwatch = configManager.watch(key, (newValue) => {
    value.value = newValue
  })

  // 清理监听器
  onUnmounted(() => {
    unwatch()
  })

  const setValue = (newValue: T): void => {
    configManager.set(key, newValue)
  }

  const reset = (): void => {
    configManager.delete(key)
    value.value = defaultValue
  }

  return {
    value: computed(() => value.value),
    setValue,
    reset
  }
}

/**
 * 本地存储组合式函数
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue?: T
): {
  value: T | undefined
  setValue: (newValue: T) => void
  remove: () => void
} {
  const getStoredValue = (): T | undefined => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      Spark.logger().warn('Failed to read from localStorage', { key, error })
      return defaultValue
    }
  }

  const value = ref<T | undefined>(getStoredValue())

  const setValue = (newValue: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(newValue))
      value.value = newValue
    } catch (error) {
      Spark.logger().error('Failed to write to localStorage', { key, error })
    }
  }

  const remove = (): void => {
    try {
      localStorage.removeItem(key)
      value.value = defaultValue
    } catch (error) {
      logger.error('Failed to remove from localStorage', { key, error })
    }
  }

  // 监听存储变化 (跨标签页)
  const handleStorageChange = (event: StorageEvent): void => {
    if (event.key === key) {
      value.value = event.newValue ? JSON.parse(event.newValue) : defaultValue
    }
  }

  onMounted(() => {
    window.addEventListener('storage', handleStorageChange)
  })

  onUnmounted(() => {
    window.removeEventListener('storage', handleStorageChange)
  })

  return {
    value: computed(() => value.value),
    setValue,
    remove
  }
}

/**
 * 主题管理组合式函数
 */
export function useTheme(): {
  theme: string
  setTheme: (theme: string) => void
  toggleTheme: () => void
  isDark: boolean
  isLight: boolean
} {
  const { value: theme, setValue: setThemeValue } = useLocalStorage('spark:theme', 'light')

  const setTheme = (newTheme: string): void => {
    setThemeValue(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  const toggleTheme = (): void => {
    const newTheme = theme.value === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  // 初始化主题
  onMounted(() => {
    if (theme.value) {
      document.documentElement.setAttribute('data-theme', theme.value)
    }
  })

  return {
    theme: computed(() => theme.value || 'light'),
    setTheme,
    toggleTheme,
    isDark: computed(() => theme.value === 'dark'),
    isLight: computed(() => theme.value === 'light')
  }
}

/**
 * 错误处理组合式函数
 */
export function useErrorHandler(): {
  handleError: (error: unknown, context?: string) => void
  withRetry: <T>(
    operation: () => Promise<T>,
    options?: { maxAttempts?: number; delay?: number }
  ) => Promise<T>
} {
  const handleError = (error: unknown, context?: string): void => {
    ErrorHandler.handle(error, context)
  }

  const withRetry = async <T>(
    operation: () => Promise<T>,
    options?: { maxAttempts?: number; delay?: number }
  ): Promise<T> => {
    return ErrorHandler.withRetry(operation, options)
  }

  return {
    handleError,
    withRetry
  }
}

/**
 * 生命周期钩子组合式函数
 */
export function useLifecycle(): {
  onBeforeMount: (callback: () => void) => void
  onMounted: (callback: () => void) => void
  onBeforeUpdate: (callback: () => void) => void
  onUpdated: (callback: () => void) => void
  onBeforeUnmount: (callback: () => void) => void
  onUnmounted: (callback: () => void) => void
} {
  const callbacks = {
    beforeMount: [] as (() => void)[],
    mounted: [] as (() => void)[],
    beforeUpdate: [] as (() => void)[],
    updated: [] as (() => void)[],
    beforeUnmount: [] as (() => void)[],
    unmounted: [] as (() => void)[]
  }

  return {
    onBeforeMount: (callback: () => void) => callbacks.beforeMount.push(callback),
    onMounted: (callback: () => void) => callbacks.mounted.push(callback),
    onBeforeUpdate: (callback: () => void) => callbacks.beforeUpdate.push(callback),
    onUpdated: (callback: () => void) => callbacks.updated.push(callback),
    onBeforeUnmount: (callback: () => void) => callbacks.beforeUnmount.push(callback),
    onUnmounted: (callback: () => void) => callbacks.unmounted.push(callback)
  }
}

/**
 * 事件监听组合式函数
 */
export function useEventListener(
  event: string,
  handler: (event: Event) => void,
  options?: boolean | AddEventListenerOptions
): {
  add: () => void
  remove: () => void
} {
  const add = (): void => {
    window.addEventListener(event, handler, options)
  }

  const remove = (): void => {
    window.removeEventListener(event, handler, options)
  }

  onMounted(() => {
    add()
  })

  onUnmounted(() => {
    remove()
  })

  return { add, remove }
}

/**
 * 窗口大小监听组合式函数
 */
export function useWindowSize(): {
  width: number
  height: number
} {
  const width = ref(window.innerWidth)
  const height = ref(window.innerHeight)

  const updateSize = (): void => {
    width.value = window.innerWidth
    height.value = window.innerHeight
  }

  useEventListener('resize', updateSize)

  return {
    width: computed(() => width.value),
    height: computed(() => height.value)
  }
}

/**
 * 可见性监听组合式函数
 */
export function useVisibility(): {
  visible: boolean
  hidden: boolean
} {
  const visible = ref(!document.hidden)

  const handleVisibilityChange = (): void => {
    visible.value = !document.hidden
  }

  useEventListener('visibilitychange', handleVisibilityChange)

  return {
    visible: computed(() => visible.value),
    hidden: computed(() => !visible.value)
  }
}

/**
 * 定时器组合式函数
 */
export function useTimeout(
  callback: () => void,
  delay: number
): {
  start: () => void
  stop: () => void
  restart: () => void
} {
  let timeoutId: NodeJS.Timeout | null = null

  const stop = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const start = (): void => {
    stop()
    timeoutId = setTimeout(() => {
      callback()
      timeoutId = null
    }, delay)
  }

  const restart = (): void => {
    stop()
    start()
  }

  onUnmounted(() => {
    stop()
  })

  return { start, stop, restart }
}

/**
 * 间隔定时器组合式函数
 */
export function useInterval(
  callback: () => void,
  delay: number
): {
  start: () => void
  stop: () => void
  restart: () => void
} {
  let intervalId: NodeJS.Timeout | null = null

  const stop = (): void => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  const start = (): void => {
    stop()
    intervalId = setInterval(callback, delay)
  }

  const restart = (): void => {
    stop()
    start()
  }

  onUnmounted(() => {
    stop()
  })

  return { start, stop, restart }
}