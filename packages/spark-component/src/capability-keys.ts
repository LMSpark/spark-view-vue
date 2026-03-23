/**
 * 能力键定义
 *
 * 能力系统属于 spark-component / spark-app 层；
 * spark-data 是纯数据层，不关心组件树或能力 DI。
 *
 * ── 数据能力链 ──
 *   PageRenderer
 *     provide(PAGE_DATASET, dataSet)      ← DataSet 实例（页面级）
 *       ↓
 *   容器组件（r-table / r-tree）
 *     consume(PAGE_DATASET)               ← 取 DataSet，解析 dataKey → DataView
 *     provide(DATA_SOURCE, dataView)      ← DataView 实例（组件级）
 *       ↓
 *   子组件（行 / 单元格）
 *     consume(DATA_SOURCE)                ← 取 DataView（IDataSource）
 *
 * ── Renderer 容器 → 字段能力链 ──
 *   容器组件（r-table / r-form / r-detail）
 *     provide(FIELD_CONTEXT, 'form')      ← 当前渲染上下文
 *     provide(CONTEXT_DATA, formModel)    ← 可写响应式数据对象
 *       ↓
 *   字段组件（r-text / r-number …）
 *     consume(FIELD_CONTEXT) ?? 'detail'
 *     consume(CONTEXT_DATA)  ?? {}
 */

import { defineCapability } from '@spark-view/spark-utils'
import type { IDataSet, IDataSource, IDataRow } from '@spark-view/spark-data'
import type { IModuleContext } from '@spark-view/spark-utils'

/** 字段渲染上下文类型 */
export type FieldContext = 'table' | 'form' | 'detail' | 'tree' | 'list'

/**
 * r-table 对外暴露的稳定 API（包装层）
 *
 * 设计目标：
 * - 优先暴露 DataView 驱动能力，避免脚本层绑定具体 UI 组件实现
 * - 保留 getNativeTable 作为 escape hatch，满足少量命令式场景
 */
export interface RendererTableApi {
  getDataSource(): IDataSource | null
  getRows(): IDataRow[]
  getCurrentRow(): IDataRow | null
  getSelectedRows(): IDataRow[]
  refresh(): Promise<void>
  appendRow(row: IDataRow): void
  updateRowById(id: string | number, patch: Partial<IDataRow>): boolean
  deleteRowById(id: string | number): boolean
  setCurrentRow(row: IDataRow | null): void
  setCurrentRowById(id: string | number | null): boolean
  setSelectedRows(rows: IDataRow[]): void
  setSelectedRowsById(ids: Array<string | number>): number
  clearSelectedRows(): void
  clearUiSelection(): void
  toggleUiRowSelection(row: IDataRow, selected?: boolean): void
  doLayout(): void
  getNativeTable(): unknown
  /** 获取当前过滤条件 */
  getFilterModel(): Record<string, unknown>
  /** 重置所有过滤条件 */
  resetFilters(): void
  /** 是否存在活跃过滤 */
  hasActiveFilters(): boolean
  /** 活跃过滤条件数量 */
  getActiveFilterCount(): number
}

/**
 * r-form 对外暴露的稳定 API
 *
 * 基于 DataView.currentRow 双向编辑，子字段通过 CONTEXT_DATA 读写。
 */
export interface RendererFormApi {
  /** 获取底层 DataView（IDataSource） */
  getDataSource(): IDataSource | null
  /** 获取当前表单数据（reactive mirror of currentRow） */
  getFormData(): Record<string, unknown>
  /** 获取底层 el-form 实例（escape hatch） */
  getNativeForm(): unknown
  /** 触发表单校验，返回是否通过 */
  validate(): Promise<boolean>
  /** 重置表单到初始值 */
  resetFields(): void
  /** 清除校验状态 */
  clearValidate(): void
  /** 读取指定字段值 */
  getFieldValue(field: string): unknown
  /** 写入指定字段值 */
  setFieldValue(field: string, value: unknown): void
}

/**
 * r-detail 对外暴露的稳定 API
 *
 * 只读详情视图，与 Form 共享 useFormDetailContainer。
 */
export interface RendererDetailApi {
  /** 获取底层 DataView（IDataSource） */
  getDataSource(): IDataSource | null
  /** 获取当前详情数据 */
  getDetailData(): Record<string, unknown>
  /** 获取当前行数据（便捷访问） */
  getCurrentRow(): IDataRow | null
  /** 读取指定字段值 */
  getFieldValue(field: string): unknown
}

/**
 * r-tree 对外暴露的稳定 API
 */
export interface RendererTreeApi {
  /** 获取底层 DataView（IDataSource） */
  getDataSource(): IDataSource | null
  /** 获取当前树数据 */
  getTreeData(): IDataRow[]
  /** 获取底层 el-tree 实例（escape hatch） */
  getNativeTree(): unknown
  /** 获取当前选中节点数据 */
  getCurrentNode(): IDataRow | null
  /** 按 key 设置当前选中节点 */
  setCurrentKey(key: string | number): void
  /** 按关键词过滤节点 */
  filter(keyword: string): void
  /** 获取已勾选节点的 key 列表（show-checkbox 模式） */
  getCheckedKeys(): Array<string | number>
  /** 设置勾选节点 key 列表 */
  setCheckedKeys(keys: Array<string | number>): void

  // ── 编辑操作 ──────────────────────────────────────────────────────────────

  /** 在指定父节点下追加子节点（parentKey 为 null 时追加到根级） */
  appendNode(parentKey: string | number | null, nodeData: IDataRow): void
  /** 在参考节点之前插入 */
  insertBefore(refKey: string | number, nodeData: IDataRow): void
  /** 在参考节点之后插入 */
  insertAfter(refKey: string | number, nodeData: IDataRow): void
  /** 更新节点数据（按 nodeKey 匹配） */
  updateNode(key: string | number, patch: Partial<IDataRow>): boolean
  /** 删除节点（按 nodeKey） */
  removeNode(key: string | number): boolean

  // ── 声明式属性 ──────────────────────────────────────────────────────────

  /** 是否允许追加子节点（控制自动生成的追加按钮） */
  getAllowAppend(): boolean
  /** 是否允许删除节点（控制自动生成的删除按钮） */
  getAllowDelete(): boolean
}

/**
 * r-list 对外暴露的稳定 API
 */
export interface RendererListApi {
  /** 获取底层 DataView（IDataSource） */
  getDataSource(): IDataSource | null
  /** 获取当前列表行数据 */
  getRows(): IDataRow[]
  /** 获取列表项数量 */
  getItemCount(): number
  /** 刷新列表数据（API 数据源） */
  refresh(): Promise<void>
}

/**
 * r-dialog 对外暴露的稳定 API
 */
export interface RendererDialogApi {
  /** 打开对话框 */
  open(): void
  /** 关闭对话框 */
  close(): void
  /** 当前是否可见 */
  isVisible(): boolean
  /** 切换显隐 */
  toggle(): void
}

/**
 * r-drawer 对外暴露的稳定 API
 */
export interface RendererDrawerApi {
  /** 打开抽屉 */
  open(): void
  /** 关闭抽屉 */
  close(): void
  /** 当前是否可见 */
  isVisible(): boolean
  /** 切换显隐 */
  toggle(): void
}

/**
 * r-tabs 对外暴露的稳定 API
 */
export interface RendererTabsApi {
  /** 获取当前激活标签页名称 */
  getActiveTab(): string | number | undefined
  /** 设置激活标签页 */
  setActiveTab(name: string | number): void
  /** 获取所有标签页名称 */
  getPaneNames(): Array<string | number>
  /** 获取标签页数量 */
  getPaneCount(): number
}

/**
 * r-collapse 对外暴露的稳定 API
 */
export interface RendererCollapseApi {
  /** 获取当前展开项 */
  getExpandedItems(): string | number | Array<string | number> | undefined
  /** 设置展开项 */
  setExpandedItems(value: string | number | Array<string | number>): void
  /** 展开全部 */
  expandAll(): void
  /** 收起全部 */
  collapseAll(): void
  /** 切换指定项的展开状态 */
  toggleItem(name: string | number): void
  /** 查询指定项是否展开 */
  isItemExpanded(name: string | number): boolean
}

/**
 * r-steps 对外暴露的稳定 API
 */
export interface RendererStepsApi {
  /** 获取当前活跃步骤名称 */
  getActiveStep(): string | number | undefined
  /** 获取当前活跃步骤索引 */
  getActiveStepIndex(): number
  /** 设置活跃步骤（按索引） */
  setActiveStep(index: number): void
  /** 下一步 */
  nextStep(): void
  /** 上一步 */
  prevStep(): void
  /** 获取步骤总数 */
  getStepCount(): number
  /** 获取所有步骤名称 */
  getStepNames(): Array<string | number>
  /** 是否为第一步 */
  isFirstStep(): boolean
  /** 是否为最后一步 */
  isLastStep(): boolean
}

/**
 * r-section / r-block 对外暴露的稳定 API
 */
export interface RendererSectionApi {
  /** 当前是否折叠 */
  isCollapsed(): boolean
  /** 设置折叠状态 */
  setCollapsed(value: boolean): void
  /** 切换折叠状态 */
  toggle(): void
}

/** 页面内组件实例快照 */
export interface PageComponentInstanceEntry {
  id: string
  type: string
  props?: Record<string, unknown>
}

/** 页面内组件 API 条目 */
export interface PageComponentApiEntry {
  id: string
  type: string
  api: unknown
}

/** 页面级组件注册中心（实例 + API） */
export interface PageComponentRegistry {
  registerInstance(entry: PageComponentInstanceEntry): void
  unregisterInstance(id: string): void
  listInstances(type?: string): PageComponentInstanceEntry[]
  getInstance(id: string): PageComponentInstanceEntry | null

  registerApi(entry: PageComponentApiEntry): void
  unregisterApi(id: string): void
  listApis(type?: string): PageComponentApiEntry[]
  getApi<T = unknown>(id: string): T | null
  getApisByType<T = unknown>(type: string): T[]
}

/** 模块上下文能力（页面级） */
export interface ModuleContextCapability {
  /** 获取当前模块上下文快照 */
  getCurrent(): IModuleContext | null
  /** 订阅模块上下文变化，返回取消订阅函数 */
  subscribe(handler: (next: IModuleContext | null, prev: IModuleContext | null) => void): () => void
}

// 将能力键合并到 CapabilityTypeMap，消费方按字符串名称即可得到精确类型，
// 无需 import 能力符号对象。
declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    /** 页面级 DataSet（PageRenderer provide） */
    'spark:capability:page-dataset': IDataSet
    /** 组件级 DataView / IDataSource（容器组件 provide） */
    'spark:capability:data-source':  IDataSource
    /** 容器告知字段组件当前渲染上下文（table/form/detail/tree/list） */
    'app:field-context': FieldContext
    /** 容器向字段组件提供可写的响应式数据对象 */
    'app:context-data': Record<string, unknown>
    /** 页面级组件注册中心（整页实例与组件 API） */
    'app:page-component-registry': PageComponentRegistry
    /** 模块上下文能力（页面级） */
    'app:module-context': ModuleContextCapability
    /** 页面 CSS 作用域注入能力（由 SparkPageRenderer provide，四文件 style.css 收口） */
    'spark:capability:css-scope': PageCssScopeCapability
  }
}

/**
 * 页面级 DataSet 能力键
 *
 * 由 PageRenderer 在 initDataSet 后 provide，
 * 容器组件通过 consume 获取后解析 dataKey → DataView。
 */
export const PAGE_DATASET = defineCapability<IDataSet>('spark:capability:page-dataset')

/**
 * 组件级数据视图能力键（DataView / IDataSource）
 *
 * 由容器组件在解析完 DataView 后 provide，
 * 子组件通过 consume 获取行数据、选中状态等。
 */
export const DATA_SOURCE = defineCapability<IDataSource>('spark:capability:data-source')

/**
 * 字段渲染上下文能力键
 * 容器组件 provide，字段组件 consume，决定字段的渲染形态
 */
export const FIELD_CONTEXT = defineCapability<FieldContext>('app:field-context')

/**
 * 字段数据上下文能力键
 * 容器组件 provide 响应式数据对象，字段组件 consume 后读写字段值
 */
export const CONTEXT_DATA = defineCapability<Record<string, unknown>>('app:context-data')

/**
 * 页面级组件注册中心能力键
 *
 * 由渲染器根节点 provide；所有组件可向其登记实例与 API，
 * 供脚本层按 id/type 查询与批量访问。
 */
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('app:page-component-registry')

/**
 * 模块上下文能力键
 *
 * 由页面渲染器根节点 provide，下游组件可 consume 后读取当前上下文并订阅变化。
 */
export const MODULE_CONTEXT = defineCapability<ModuleContextCapability>('app:module-context')

/**
 * 页面 CSS 作用域注入能力
 *
 * 由 SparkPageRenderer 在初始化 useCssScope 后 provide；
 * 插件、子渲染器或需要动态注入 CSS 的组件可 consume 后按需追加样式。
 * 注入的 CSS 会被 pageId scoping 自动处理（与静态 style.css 一致）。
 */
export interface PageCssScopeCapability {
  /** 注入/追加 CSS 到当前页面作用域 */
  inject(css: string): void
}

/**
 * 页面 CSS 作用域能力键
 *
 * 四文件中 style.css 的能力链收口：
 *   style.css → parseCss → PageConfig.css → setScopedCss + provide(CSS_SCOPE)
 *
 * 消费方：插件、嵌套渲染器、动态主题注入等。
 */
export const CSS_SCOPE = defineCapability<PageCssScopeCapability>('spark:capability:css-scope')
