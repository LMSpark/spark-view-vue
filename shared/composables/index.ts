// Re-exported from new package to keep compatibility while package migrates
export * from '@spark-view/spark-core/composables'
import { getWindow, getDocument, isBrowser } from '@spark-view/spark-core/utils/env'
/**
 * 主题管理组合式函数
 * SSR 兼容：主题设置在客户端挂载时执行
 */
export function useTheme(): {
  theme: Ref<string>
  setTheme: (theme: string) => void
  toggleTheme: () => void
  isDark: Ref<boolean>
  isLight: Ref<boolean>
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

  // 初始化主题
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
 * SSR 兼容：在服务器端安全跳过事件监听
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
    const win = getWindow()
    if (win) {
      win.addEventListener(event, handler, options)
    }
  }

  const remove = (): void => {
    const win = getWindow()
    if (win) {
      win.removeEventListener(event, handler, options)
    }
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
 * SSR 兼容：在服务器端返回默认值 (0, 0)
 */
export function useWindowSize(): {
  width: Ref<number>
  height: Ref<number>
} {
  const width = ref(isBrowser() ? window.innerWidth : 0)
  const height = ref(isBrowser() ? window.innerHeight : 0)

  const updateSize = (): void => {
    const win = getWindow()
    if (win) {
      width.value = win.innerWidth
      height.value = win.innerHeight
    }
  }

  useEventListener('resize', updateSize)

  return {
    width: computed(() => width.value),
    height: computed(() => height.value)
  }
}

/**
 * 可见性监听组合式函数
 * SSR 兼容：在服务器端默认为可见状态
 */
export function useVisibility(): {
  visible: Ref<boolean>
  hidden: Ref<boolean>
} {
  const visible = ref(isBrowser() ? !document.hidden : true)

  const handleVisibilityChange = (): void => {
    const doc = getDocument()
    if (doc) {
      visible.value = !doc.hidden
    }
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