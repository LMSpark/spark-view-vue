/**
 * DevSystem 预计算投影
 *
 * 从 component-catalog.json 一次性投影出 DevSystem 编辑器所需的
 * 类型列表、属性名映射、枚举值映射。仅在 DevSystem 路由被加载时执行。
 */

import type { ComponentCatalog } from './types'
import {
  projectDevTypes,
  projectDevPropNames,
  projectDevPropEnums,
  projectDevTypeLabels,
  projectDevRequiredProps,
  projectFrameworkNeutralCatalog,
} from './catalog-projections'
import catalogJson from './component-catalog.json'

const catalog = projectFrameworkNeutralCatalog(catalogJson as ComponentCatalog)

export const DEV_TYPES: string[] = projectDevTypes(catalog)
export const DEV_PROP_NAMES: Record<string, string[]> = projectDevPropNames(catalog)
export const DEV_PROP_ENUMS: Record<string, Record<string, string[]>> = projectDevPropEnums(catalog)
export const DEV_TYPE_LABELS: Record<string, string> = projectDevTypeLabels(catalog)
export const DEV_REQUIRED_PROPS: Record<string, Record<string, unknown>> = projectDevRequiredProps(catalog)
