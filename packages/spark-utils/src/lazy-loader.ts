/**
 * 智能按需加载器 - 优化大型库的加载时机
 *
 * 设计理念：
 * - 延迟加载大型第三方库，直到用户实际需要时
 * - 提供加载状态和错误处理
 * - 支持预加载和缓存
 */

import { ref, readonly } from 'vue'

// 加载状态缓存
const loadCache = new Map<string, Promise<unknown>>()
const loadedModules = new Map<string, unknown>()

/**
 * 按需加载 Syncfusion 组件
 * - 延迟到用户首次使用 Grid/Table 组件时加载
 * - 自动处理样式加载
 */
export function useSyncfusionLoader() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const load = async (): Promise<typeof import('@syncfusion/ej2-vue-grids')> => {
    if (loadedModules.has('syncfusion-grids')) {
      return loadedModules.get('syncfusion-grids') as typeof import('@syncfusion/ej2-vue-grids')
    }

    const existingPromise = loadCache.get('syncfusion-grids')
    if (existingPromise) {
      return existingPromise as Promise<typeof import('@syncfusion/ej2-vue-grids')>
    }

    const loadPromise = (async () => {
      try {
        loading.value = true
        error.value = null

        // 并行加载 JS 和 CSS
        const [gridsModule] = await Promise.all([
          import('@syncfusion/ej2-vue-grids'),
          // 动态加载样式（避免首屏阻塞）
          new Promise<void>((resolve) => {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = 'https://cdn.syncfusion.com/ej2/material.css'
            link.onload = () => resolve()
            link.onerror = () => resolve() // 样式加载失败不阻塞 JS
            document.head.appendChild(link)
          })
        ])

        loadedModules.set('syncfusion-grids', gridsModule)
        loading.value = false
        return gridsModule
      } catch (err) {
        // 清除失败的缓存条目，允许后续重试（网络恢复后）
        loadCache.delete('syncfusion-grids')
        error.value = err instanceof Error ? err.message : '加载失败'
        loading.value = false
        throw err
      }
    })()

    loadCache.set('syncfusion-grids', loadPromise)
    return loadPromise
  }

  return {
    loading: readonly(loading),
    error: readonly(error),
    load
  }
}

/**
 * 通用按需加载器
 * - 支持任意模块的延迟加载
 */
export function useLazyLoader<T = unknown>(moduleId: string) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  const load = async (importFn: () => Promise<T>): Promise<T> => {
    if (loadedModules.has(moduleId)) {
      loaded.value = true
      return loadedModules.get(moduleId) as T
    }

    const existingPromise = loadCache.get(moduleId)
    if (existingPromise) {
      const result = await existingPromise
      loaded.value = true
      return result as T
    }

    const loadPromise = (async () => {
      try {
        loading.value = true
        error.value = null

        const module = await importFn()
        loadedModules.set(moduleId, module)
        loaded.value = true
        loading.value = false
        return module
      } catch (err) {
        // 清除失败的缓存条目，允许后续重试（网络恢复后）
        loadCache.delete(moduleId)
        error.value = err instanceof Error ? err.message : '模块加载失败'
        loading.value = false
        throw err
      }
    })()

    loadCache.set(moduleId, loadPromise)
    return loadPromise
  }

  return {
    loading: readonly(loading),
    error: readonly(error),
    loaded: readonly(loaded),
    load
  }
}

/**
 * 预加载器 - 在空闲时预加载可能需要的模块
 */
export class Preloader {
  private static instance: Preloader
  private preloadQueue: Array<() => Promise<void>> = []
  private isRunning = false

  static getInstance(): Preloader {
    if (!Preloader.instance) {
      Preloader.instance = new Preloader()
    }
    return Preloader.instance
  }

  /**
   * 添加预加载任务
   */
  add(task: () => Promise<void>): void {
    this.preloadQueue.push(task)
    void this.run()
  }

  /**
   * 预加载 Syncfusion（在用户可能使用表格时调用）
   */
  preloadSyncfusion(): void {
    void this.add(async () => {
      try {
        await import('@syncfusion/ej2-vue-grids')
      } catch (err) {
        console.warn('预加载 Syncfusion 失败:', err)
      }
    })
  }

  private async run(): Promise<void> {
    if (this.isRunning || this.preloadQueue.length === 0) return

    this.isRunning = true

    // 使用 requestIdleCallback 或 setTimeout 进行空闲加载
    const runTask = () => {
      if (this.preloadQueue.length === 0) {
        this.isRunning = false
        return
      }

      const task = this.preloadQueue.shift()
      if (task) {
        void task().finally(() => {
          // 递归执行下一个任务
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(runTask)
          } else {
            setTimeout(runTask, 100)
          }
        })
      }
    }

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(runTask)
    } else {
      setTimeout(runTask, 100)
    }
  }
}

// 导出单例
export const preloader = Preloader.getInstance()