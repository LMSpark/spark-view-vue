/**
 * 脚本沙箱上下文（PageContext）构建工厂
 *
 * 从 usePageRenderer 提取——构建传入 `with (__ctx)` 沙箱的完整上下文对象。
 * $dataSet 使用 getter，保证脚本每次访问都拿到最新值。
 *
 * 提供两个入口：
 * - `buildPageContext`    — 共享基础上下文（SPARK 原生渲染线直接使用）
 * - `buildFCPageContext`  — FC 渲染器扩展（追加 $api / $rebindRules）
 */

import { h, type Ref } from 'vue'
import type { IPageServiceCapability } from '@spark-view/spark-utils'
import type { IPageRoute, IFormAPI } from '@spark-view/spark-page-config'
import type { DataSet } from '@spark-view/spark-data'
import { SparkData } from '@spark-view/spark-data'
import type { PageContext, FCPageContext, FormCreateAPI } from '../types'

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

// ─── 共享基础上下文（两条渲染线共用）────────────────────────────────────

/** buildPageContext 所需的依赖引用 */
export interface PageContextDeps {
  /** DataSet getter（闭包引用，每次调用返回最新值） */
  getDataSet: () => DataSet | null
  pageRoute: IPageRoute
  pageContainer: Ref<HTMLElement | null>
  pageService: IPageServiceCapability
}

/**
 * 构建共享基础脚本上下文（不含 form-create API）
 */
export function buildPageContext(deps: PageContextDeps): PageContext {
  const { getDataSet, pageRoute, pageContainer, pageService } = deps

  return {
    get $dataSet() { return getDataSet() },

    $route:       pageRoute,
    $el:          () => pageContainer.value,
    $query:       (selector: string) => pageContainer.value?.querySelector(selector) ?? null,
    $queryAll:    (selector: string) => {
      return pageContainer.value?.querySelectorAll(selector)
        ?? document.createDocumentFragment().querySelectorAll(selector)
    },
    $refreshData: createRefreshData(getDataSet),

    $page: pageService,
    SparkData,
    h,

    // Timer APIs — safe wrappers delegating to global timers
    setTimeout:    (handler: (...args: unknown[]) => void, timeout?: number) => window.setTimeout(handler, timeout),
    clearTimeout:  (id?: number) => { window.clearTimeout(id) },
    setInterval:   (handler: (...args: unknown[]) => void, timeout?: number) => window.setInterval(handler, timeout),
    clearInterval: (id?: number) => { window.clearInterval(id) },
  }
}

// ─── FC 渲染器上下文（扩展 form-create API）────────────────────────────────────

/** buildFCPageContext 所需的依赖引用（包含 form-create 特有依赖） */
export interface FCPageContextDeps extends PageContextDeps {
  formApi: Ref<FormCreateAPI | null>
  rebindRules: () => void
}

/**
 * 构建 FC 渲染器的脚本沙箱上下文（含 $api / $rebindRules）
 */
export function buildFCPageContext(deps: FCPageContextDeps): FCPageContext {
  const { formApi, getDataSet, rebindRules } = deps

  return {
    ...buildPageContext(deps),
    // 重新定义 getter（spread 会将 getter 求值为静态快照，故需覆盖）
    get $dataSet() { return getDataSet() },
    get $api()     { return formApi.value as IFormAPI | null },
    $rebindRules:  () => rebindRules(),
  }
}
