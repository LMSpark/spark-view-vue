/**
 * 脚本沙箱上下文（PageContext）构建工厂
 *
 * 从 usePageRenderer 提取——构建传入 `with (__ctx)` 沙箱的完整上下文对象。
 * $api / $dataSet 使用 getter，保证脚本每次访问都拿到最新值。
 */

import { h, type Ref } from 'vue'
import type { IPageServiceCapability } from '@spark-view/spark-utils'
import type { IPageRoute, IFormAPI } from '@spark-view/spark-page-config'
import type { DataSet } from '@spark-view/spark-data'
import { SparkData } from '@spark-view/spark-data'
import type { PageContext, FormCreateAPI } from '../types'

/** buildPageContext 所需的依赖引用 */
export interface PageContextDeps {
  formApi: Ref<FormCreateAPI | null>
  /** DataSet getter（闭包引用，每次调用返回最新值） */
  getDataSet: () => DataSet | null
  pageRoute: IPageRoute
  pageContainer: Ref<HTMLElement | null>
  rebindRules: () => void
  pageService: IPageServiceCapability
}

/**
 * 构建脚本沙箱上下文
 *
 * @param deps 依赖引用（均通过 getter 惰性读取，支持延迟绑定）
 */
export function buildPageContext(deps: PageContextDeps): PageContext {
  const { formApi, getDataSet, pageRoute, pageContainer, rebindRules, pageService } = deps

  return {
    get $api()     { return formApi.value as IFormAPI | null },
    get $dataSet() { return getDataSet() },

    $route:    pageRoute,
    $el:       () => pageContainer.value,
    $query:    (selector: string) => pageContainer.value?.querySelector(selector) ?? null,
    $queryAll: (selector: string) => {
      if (pageContainer.value?.querySelectorAll)
        return pageContainer.value.querySelectorAll(selector)
      if (typeof document !== 'undefined')
        return document.querySelectorAll(selector)
      return [] as unknown as NodeListOf<Element>
    },

    $rebindRules:  () => rebindRules(),
    $refreshData:  async (tableName?: string) => {
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
    },

    $page: pageService,
    SparkData,
    h,
  }
}
