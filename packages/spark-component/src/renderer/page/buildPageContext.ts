/**
 * 脚本沙箱上下文（PageContext）构建工厂
 *
 * 构建传入 `with (__ctx)` 沙箱的完整上下文对象。
 * $dataSet 使用 getter，保证脚本每次访问都拿到最新值。
 */

import { h, type Ref } from 'vue'
import type { IPageServiceCapability, IModuleContext } from '@spark-view/spark-utils'
import type { IPageRoute } from '@spark-view/spark-page-config'
import type { DataSet } from '@spark-view/spark-data'
import { SparkData } from '@spark-view/spark-data'
import type { PageContext } from '../types'
import type { PageComponentRegistry } from '../../capability-keys'
import { pageLogger } from '../binding/bind-helpers'

// ─── 共享 $refreshData 实现 ──────────────────────────────────────────────────

function createRefreshData(getDataSet: () => DataSet | null): (tableName?: string) => Promise<void> {
  return async (tableName?: string) => {
    const ds = getDataSet()
    if (!ds) return
    if (tableName) {
      const view = ds.getView(tableName, 'default')
      if (view?.crudService) {
        await view.refresh()
      }
    } else {
      const promises: Array<Promise<void>> = []
      for (const table of Object.values(ds.tables)) {
        const view = table.getView('default')
        if (view?.crudService) {
          promises.push(view.refresh())
        }
      }
      await Promise.all(promises)
    }
  }
}

function createScriptConsole(): Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'> {
  return {
    log: (...args: unknown[]) => { pageLogger.info('[script]', ...args) },
    info: (...args: unknown[]) => { pageLogger.info('[script]', ...args) },
    warn: (...args: unknown[]) => { pageLogger.warn('[script]', ...args) },
    error: (...args: unknown[]) => { pageLogger.error('[script]', ...args) },
    debug: (...args: unknown[]) => { pageLogger.debug('[script]', ...args) },
  }
}

// ─── 共享基础上下文（两条渲染线共用）────────────────────────────────────

/** buildPageContext 所需的依赖引用 */
export interface PageContextDeps {
  /** DataSet getter（闭包引用，每次调用返回最新值） */
  getDataSet: () => DataSet | null
  pageRoute: IPageRoute
  pageContainer: Ref<HTMLElement | null>
  pageService: IPageServiceCapability
  /** 页面级组件注册中心 getter（可选） */
  getComponentRegistry?: () => PageComponentRegistry | null
  /** 模块上下文 getter（可选，每次调用返回最新快照） */
  getModuleContext?: () => IModuleContext | null
}

function createEmptyComponentAccess(): PageContext['$components'] {
  return {
    get: () => null,
    getApi: () => null,
    list: () => [],
    getApis: () => [],
    getInstance: () => null,
    listInstances: () => [],
  }
}

function createComponentAccess(getRegistry?: () => PageComponentRegistry | null): PageContext['$components'] {
  const fallback = createEmptyComponentAccess()

  const getSafeRegistry = (): PageComponentRegistry | null => {
    const registry = getRegistry?.() ?? null
    return registry
  }

  return {
    get(id: string) {
      const registry = getSafeRegistry()
      return registry?.getInstance(id) ?? fallback.get(id)
    },
    getApi<T = unknown>(id: string) {
      const registry = getSafeRegistry()
      return registry?.getApi<T>(id) ?? fallback.getApi<T>(id)
    },
    list(type?: string) {
      const registry = getSafeRegistry()
      return registry?.listInstances(type) ?? fallback.list(type)
    },
    getApis<T = unknown>(type?: string) {
      const registry = getSafeRegistry()
      if (!registry) return fallback.getApis<T>(type)
      if (type === undefined || type.trim().length === 0) {
        return registry.listApis().map(item => item.api as T)
      }
      return registry.getApisByType<T>(type)
    },
    getInstance(id: string) {
      const registry = getSafeRegistry()
      return registry?.getInstance(id) ?? fallback.getInstance(id)
    },
    listInstances(type?: string) {
      const registry = getSafeRegistry()
      return registry?.listInstances(type) ?? fallback.listInstances(type)
    },
  }
}

/**
 * 构建脚本沙箱上下文
 */
export function buildPageContext(deps: PageContextDeps): PageContext {
  const { getDataSet, pageRoute, pageContainer, pageService } = deps
  const scriptConsole = createScriptConsole()
  const componentAccess = createComponentAccess(deps.getComponentRegistry)

  return {
    get $dataSet() { return getDataSet() },
    get $moduleContext() { return deps.getModuleContext?.() ?? null },
    $components: componentAccess,

    $route:       pageRoute,
    $el:          () => pageContainer.value,
    $query:       (selector: string) => pageContainer.value?.querySelector(selector) ?? null,
    $queryAll:    (selector: string) => {
      return pageContainer.value?.querySelectorAll(selector)
        ?? document.createDocumentFragment().querySelectorAll(selector)
    },
    $refreshData: createRefreshData(getDataSet),

    $page: pageService,
    console: scriptConsole,
    SparkData,
    h: h as (type: unknown, ...args: unknown[]) => unknown,

    // Timer APIs — safe wrappers delegating to global timers
    setTimeout:    (handler: (...args: unknown[]) => void, timeout?: number) => window.setTimeout(handler, timeout),
    clearTimeout:  (id?: number) => { window.clearTimeout(id) },
    setInterval:   (handler: (...args: unknown[]) => void, timeout?: number) => window.setInterval(handler, timeout),
    clearInterval: (id?: number) => { window.clearInterval(id) },
  }
}


