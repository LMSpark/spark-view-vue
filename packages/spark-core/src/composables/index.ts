// Composables moved into package - original source copied and adjusted imports
import { ref, computed, onMounted, onUnmounted, type ComputedRef, type UnwrapRef } from 'vue'
import { asyncUtils, RaceController } from '../utils/asyncUtils.js'
import { handleError, withRetry, type RetryOptions, type ErrorContext } from '../utils/errorHandler.js'
import { ConfigManager } from '../utils/configManager.js'
import { Spark } from '../spark-namespace.js'
import { storageAvailable, readLocalStorage, writeLocalStorage, removeLocalStorage, getWindow, safeAddEventListener, safeRemoveEventListener, getDocument } from '../utils/env.js'
type LocalAsyncState<T> = { data?: T; loading: boolean; error?: Error }

export function useAsyncState<T>(
  initialData?: T
): {
  state: ComputedRef<LocalAsyncState<T>>
  execute: (operation: () => Promise<T>) => Promise<void>
  reset: () => void
  isLoading: ComputedRef<boolean>
  isSuccess: ComputedRef<boolean>
  isError: ComputedRef<boolean>
  data: ComputedRef<T | undefined>
  error: ComputedRef<Error | undefined>
} {
  const state = ref<LocalAsyncState<T>>({
    data: initialData as unknown as T,
    loading: false,
    error: undefined
  })

  const execute = async (operation: () => Promise<T>): Promise<void> => {
    state.value.loading = true
    state.value.error = undefined

    try {
      const result = await operation()
      state.value.data = result as unknown as UnwrapRef<T>
    } catch (error) {
      state.value.error = error instanceof Error ? error : new Error(String(error))
      Spark.Logger().error('Async operation failed', { error: state.value.error })
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
    state: computed(() => state.value) as ComputedRef<LocalAsyncState<T>>,
    execute,
    reset,
    isLoading: computed(() => state.value.loading),
    isSuccess: computed(() => !state.value.loading && !state.value.error),
    isError: computed(() => !!state.value.error),
    data: computed(() => state.value.data) as ComputedRef<T | undefined>,
    error: computed(() => state.value.error)
  }
}

export function useRaceSafe<T>(): {
  execute: (operation: () => Promise<T>) => Promise<T | undefined>
  abort: () => void
  aborted: ComputedRef<boolean>
} {
  const controller = ref<RaceController | null>(null)

  const execute = async (operation: () => Promise<T>): Promise<T | undefined> => {
    if (!controller.value) {
      controller.value = asyncUtils.createRaceController()
    }

    try {
      return await asyncUtils.raceSafe<T>(operation, controller.value!)
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation was cancelled') {
        Spark.Logger().debug('Race-safe operation was cancelled')
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

// Debounce / throttle
export function useDebounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
): T & { cancel(): void; flush(): ReturnType<T> | undefined } {
  return asyncUtils.debounce(func, wait, options)
}

export function useThrottle<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
): T & { cancel(): void; flush(): ReturnType<T> | undefined } {
  return asyncUtils.throttle(func, wait, options)
}

export function useConfig<T>(
  key: string,
  defaultValue?: T
): {
  value: ComputedRef<T | undefined>
  setValue: (newValue: T) => void
  reset: () => void
} {
  const configManager = ConfigManager.getInstance()
  const value = ref<T | undefined>(configManager.get(key, defaultValue))

  const unwatch = configManager.watch(key, (newValue) => {
    value.value = newValue
  })

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

export function useLocalStorage<T>(
  key: string,
  defaultValue?: T
): {
  value: ComputedRef<T | undefined>
  setValue: (newValue: T) => void
  remove: () => void
} {

  const getStoredValue = (): T | undefined => {
    try {
      const item = storageAvailable() ? readLocalStorage(key) : null
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      Spark.Logger().warn('Failed to read from localStorage', { key, error })
      return defaultValue
    }
  }

  const value = ref<T | undefined>(getStoredValue())

  const setValue = (newValue: T): void => {
    try {
      if (storageAvailable()) writeLocalStorage(key, JSON.stringify(newValue))
      value.value = newValue
    } catch (error) {
      Spark.Logger().error('Failed to write to localStorage', { key, error })
    }
  }

  const remove = (): void => {
    try {
      if (storageAvailable()) removeLocalStorage(key)
      value.value = defaultValue
    } catch (error) {
      Spark.Logger().error('Failed to remove from localStorage', { key, error })
    }
  }

  const handleStorageChange = (event: StorageEvent): void => {
    if (event.key === key) {
      value.value = event.newValue ? JSON.parse(event.newValue) : defaultValue
    }
  }

  onMounted(() => {
    const w = getWindow()
    if (w) safeAddEventListener(w, 'storage', handleStorageChange)
  })

  onUnmounted(() => {
    const w = getWindow()
    if (w) safeRemoveEventListener(w, 'storage', handleStorageChange as any)
  })

  return {
    value: computed(() => value.value),
    setValue,
    remove
  }
}

export function useTheme(): {
  theme: ComputedRef<string>
  setTheme: (theme: string) => void
  toggleTheme: () => void
  isDark: ComputedRef<boolean>
  isLight: ComputedRef<boolean>
} {
  const { value: theme, setValue: setThemeValue } = useLocalStorage('spark:theme', 'light')

  const setTheme = (newTheme: string): void => {
    setThemeValue(newTheme)
    const doc = getDocument()
    if (doc && doc.documentElement) doc.documentElement.setAttribute('data-theme', newTheme)
  }

  const toggleTheme = (): void => {
    const newTheme = theme.value === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  onMounted(() => {
    const doc = getDocument()
    if (doc && theme.value) {
      doc.documentElement.setAttribute('data-theme', theme.value)
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

export function useErrorHandler(): {
  handleError: (error: unknown, context?: ErrorContext) => void
  withRetry: <T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ) => Promise<T>
} {
  const handleErr = (error: unknown, context?: ErrorContext): void => {
    handleError(error, context)
  }

  const retry = async <T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T> => {
    return withRetry(operation, options)
  }

  return {
    handleError: handleErr,
    withRetry: retry
  }
}

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

import { safeAddEventListener, safeRemoveEventListener, getWindow } from '../utils/env.js'

export function useEventListener(
  event: string,
  handler: (event: Event) => void,
  options?: boolean | AddEventListenerOptions
): {
  add: () => void
  remove: () => void
} {
  const add = (): void => {
    const target = getWindow()
    safeAddEventListener(target, event, handler as any, options)
  }

  const remove = (): void => {
    const target = getWindow()
    safeRemoveEventListener(target, event, handler as any, options as any)
  }

  onMounted(() => {
    add()
  })

  onUnmounted(() => {
    remove()
  })

  return { add, remove }
}

export function useWindowSize(): {
  width: ComputedRef<number>
  height: ComputedRef<number>
} {
  const w = getWindow()
  const width = ref(w ? w.innerWidth : 0)
  const height = ref(w ? w.innerHeight : 0)

  const updateSize = (): void => {
    const t = getWindow()
    if (!t) return
    width.value = t.innerWidth
    height.value = t.innerHeight
  }

  // only attach listener when window available
  if (w) useEventListener('resize', updateSize)

  return {
    width: computed(() => width.value),
    height: computed(() => height.value)
  }
}

export function useVisibility(): {
  visible: ComputedRef<boolean>
  hidden: ComputedRef<boolean>
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
