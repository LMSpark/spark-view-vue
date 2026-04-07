/**
 * SAP Catalog 类型定义
 *
 * 从完整 VCM ComponentCatalog 裁剪的轻量版，专供 Stills 引擎消费。
 * 仅保留 type + category + description + props(name/type/required)。
 */

/** SAP 组件目录根结构 */
export interface SapCatalog {
  /** 目录版本号（语义化版本） */
  version: string
  /** 构建时间（ISO 8601） */
  buildTime: string
  /** 组件总数 */
  componentCount: number
  /** 按分类索引的组件类型名列表 */
  registry: SapCatalogRegistry
  /** 组件详情，key = 组件 type（kebab-case） */
  components: Record<string, SapComponentEntry>
}

/** 分类注册表 — 按 category 索引的组件 type 列表 */
export interface SapCatalogRegistry {
  /** 容器组件（r-table / r-form / r-detail 等） */
  containers: string[]
  /** 字段组件（r-text / r-number / r-select 等） */
  fields: string[]
  /** 分组/布局组件（r-row / r-col / el-tabs 等） */
  groups: string[]
  /** 元组件（builtin-action / display-* 等） */
  meta: string[]
}

/** 单个组件条目（轻量版） */
export interface SapComponentEntry {
  /** 组件分类 */
  category: 'container' | 'field' | 'group' | 'meta' | 'feature'
  /** 组件用途描述 */
  description: string
  /** 支持的 props 列表（含 rootFields 合并） */
  props: SapPropEntry[]
  /** 组件事件列表 */
  emits?: SapEmitEntry[]
  /** 根级配置字段（rule.json 根级可写的字段） */
  rootFields?: SapRootFieldEntry[]
  /** 补充说明 */
  notes?: string
  /** 数据绑定配置 */
  binding?: Record<string, unknown>
  /** 嵌套规则（可放哪些子组件） */
  nestingRule?: SapNestingRule
}

/** 事件条目 */
export interface SapEmitEntry {
  /** 事件名 */
  name: string
  /** 事件描述 */
  description?: string
  /** 事件签名类型 */
  type?: string
}

/** 根级字段条目 */
export interface SapRootFieldEntry {
  /** 字段名 */
  name: string
  /** TypeScript 类型字符串 */
  type: string
  /** 字段描述 */
  description: string
}

/** 嵌套规则 */
export interface SapNestingRule {
  /** 允许的子组件类型（支持通配符如 `r-*`） */
  allowedChildren: string[]
  /** 禁止的子组件类型 */
  forbiddenChildren?: string[]
  /** 说明 */
  note?: string
}

/** 属性条目 */
export interface SapPropEntry {
  /** 属性名（camelCase） */
  name: string
  /** TypeScript 类型字符串（如 `"string"`, `"\"primary\" | \"success\""` 等） */
  type: string
  /** 是否必填 */
  required: boolean
  /** 默认值（字符串表示） */
  default?: string
  /** 属性描述 */
  description?: string
}
