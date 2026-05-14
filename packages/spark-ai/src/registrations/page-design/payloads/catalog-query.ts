import jmespath from 'jmespath'
import { projectFunctionCatalog } from './catalog-projections'
import { COMPONENT_CATALOG_JSON, RAW_COMPONENT_CATALOG_JSON } from './component-catalog-source'

export type ComponentCatalogQuerySource = 'raw' | 'frameworkNeutral' | 'function'

export interface ComponentCatalogQueryOptions {
  /** 查询源；raw 为落盘 JSON，frameworkNeutral 为默认跨框架投影，function 为轻量函数目录。 */
  source?: ComponentCatalogQuerySource
  /** 显式传入查询数据时优先使用该对象。 */
  data?: unknown
}

function getComponentCatalogQueryData(options: ComponentCatalogQueryOptions): unknown {
  if (options.data !== undefined) return options.data
  if (options.source === 'raw') return RAW_COMPONENT_CATALOG_JSON
  if (options.source === 'function') return projectFunctionCatalog(COMPONENT_CATALOG_JSON)
  return COMPONENT_CATALOG_JSON
}

export function queryComponentCatalog<TResult = unknown>(
  expression: string,
  options: ComponentCatalogQueryOptions = {},
): TResult {
  const normalizedExpression = expression.trim()
  if (normalizedExpression.length === 0) {
    throw new Error('component catalog JMESPath expression must not be empty')
  }

  return jmespath.search(getComponentCatalogQueryData(options), normalizedExpression) as TResult
}
