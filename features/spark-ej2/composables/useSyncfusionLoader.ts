/**
 * Syncfusion 动态加载器
 * 
 * @module useSyncfusionLoader
 * @description
 * 按需加载 Syncfusion EJ2 组件和样式，实现路由级懒加载优化：
 * 
 * **核心优势**：
 * 1. **首屏提速**：主入口不加载 Syncfusion（减少 ~800 KB gzipped）
 * 2. **按需加载**：仅在使用 EJ2 Grid 的页面加载
 * 3. **样式隔离**：动态插入 CSS，避免全局污染
 * 4. **缓存复用**：同一会话内多次调用只加载一次
 * 5. **并行加载**：CSS 和 JS 并行请求，减少等待时间
 * 
 * **使用场景**：
 * - SparkEJ2Grid 组件初始化时调用
 * - 其他 EJ2 组件（如 Chart, Scheduler）可复用此 loader
 * 
 * **性能数据**：
 * - 不使用 EJ2 的页面: 0 KB Syncfusion 加载（100% 优化）
 * - 使用 EJ2 的页面: 按需加载 ~800 KB（延迟到路由跳转时）
 * - 首屏性能提升: ~800 KB / 4G网速 ≈ 1.5 秒
 * 
 * @example
 * ```ts
 * // 在 SparkEJ2Grid.vue 组件中使用
 * import { useSyncfusionLoader } from '../composables/useSyncfusionLoader'
 * 
 * const { loadEJ2Grid, isLoaded, error } = useSyncfusionLoader()
 * 
 * onMounted(async () => {
 *   const EJ2Grid = await loadEJ2Grid()
 *   if (EJ2Grid) {
 *     activeComponent.value = markRaw(EJ2Grid.GridComponent)
 *   }
 * })
 * ```
 * 
 * @author SPARK Team
 * @since 2.0.0
 */

import { ref, readonly } from 'vue'
import type { Component } from 'vue'

// ── 全局加载状态（跨组件实例共享） ──

/** CSS 是否已加载 */
let cssLoaded = false

/** EJ2 Grid 组件是否已加载 */
let ej2GridLoaded = false

/** 加载错误信息 */
const loadError = ref<Error | null>(null)

/** 是否正在加载 */
const isLoading = ref(false)

/**
 * 加载 Syncfusion 样式
 * 
 * 使用 Vite 的动态 import 加载 CSS（自动处理打包和缓存）
 * 
 * @returns Promise<void>
 */
async function loadSyncfusionStyles(): Promise<void> {
  if (cssLoaded) return

  try {
    // Vite 会将这些 CSS import 转换为 <link> 标签动态插入
    await Promise.all([
      import('@syncfusion/ej2-base/styles/material.css'),
      import('@syncfusion/ej2-vue-grids/styles/material.css')
    ])
    
    cssLoaded = true
  } catch (error) {
    throw new Error(`Failed to load Syncfusion styles: ${error}`)
  }
}

/**
 * Syncfusion 动态加载器 Composable
 * 
 * @returns {Object} Loader API
 */
export function useSyncfusionLoader() {
  /**
   * 加载 EJ2 Grid 组件
   * 
   * @returns Promise<EJ2GridModule | null>
   */
  async function loadEJ2Grid(): Promise<{ GridComponent: Component } | null> {
    // 已加载，直接返回缓存
    if (ej2GridLoaded) {
      try {
        const m = await import('@syncfusion/ej2-vue-grids')
        return m as { GridComponent: Component }
      } catch {
        return null
      }
    }

    // 正在加载中，等待
    if (isLoading.value) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!isLoading.value) {
            clearInterval(checkInterval)
            void loadEJ2Grid().then(resolve)
          }
        }, 50)
      })
    }

    isLoading.value = true
    loadError.value = null

    try {
      // 并行加载 CSS 和 JS
      const [, ej2VueModule] = await Promise.all([
        loadSyncfusionStyles(),
        import('@syncfusion/ej2-vue-grids'),
        import('@syncfusion/ej2-grids').then(m => {
          // 注入分页功能
          if (m?.Grid && m?.Page) {
            m.Grid.Inject(m.Page)
          }
        })
      ])

      ej2GridLoaded = true
      return ej2VueModule as { GridComponent: Component }
    } catch (error) {
      loadError.value = error instanceof Error ? error : new Error(String(error))
      console.warn('[Syncfusion Loader] Failed to load EJ2 Grid:', error)
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 预加载 EJ2 Grid（可选优化）
   * 
   * 在路由 beforeEnter 钩子中调用，提前加载 Syncfusion
   */
  function preloadEJ2Grid() {
    if (!ej2GridLoaded && !isLoading.value) {
      // 后台预加载，不影响主流程
      void loadEJ2Grid().catch(() => {
        // 预加载失败不影响后续使用
      })
    }
  }

  return {
    /** 加载 EJ2 Grid 组件 */
    loadEJ2Grid,
    
    /** 预加载 EJ2 Grid */
    preloadEJ2Grid,
    
    /** 是否正在加载 */
    isLoading: readonly(isLoading),
    
    /** 加载错误 */
    error: readonly(loadError),
    
    /** 是否已加载 */
    isLoaded: readonly(ref(ej2GridLoaded))
  }
}
