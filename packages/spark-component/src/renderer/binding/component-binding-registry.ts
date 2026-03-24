/**
 * 组件绑定注册表 — 配置驱动的绑定管线分发
 *
 * **核心设计**：将散布在 bindRules / bind-form-delegate / bind-context / bind-permission-delegate
 * 中的 7 个硬编码 Set 统一收入声明式注册表，使"组件类型 → 绑定行为"完全由注册驱动。
 *
 * **长期目标**：
 * - AI 生成新组件类型时调用 `registerBindingDescriptor()` 即可自动接入绑定管线
 * - 第三方组件库（VxeTable / Syncfusion）自描述绑定行为，零框架改动
 * - 所有组件分类逻辑集中在此文件，消除跨文件同步风险
 *
 * **扩展方式**：
 * ```typescript
 * registerBindingDescriptor('vxe-table', { bindingDelegate: 'table', dataContainer: true })
 * registerBindingDescriptor('custom-switch', { bindingDelegate: 'form-element', valueType: 'boolean' })
 * ```
 */

import type { ComponentRegistry } from '../../types.js'

// ── 类型定义 ──────────────────────────────────────────────────────────────

/**
 * 绑定委托类型 — dispatchDataKeyBinding 的分发键
 *
 * - `table`：el-table 专用委托（数据行 + 事件注入 + 加载状态）
 * - `pagination`：el-pagination 专用委托（分页双向绑定）
 * - `form-element`：值型表单组件委托（选项映射 + modelValue 双向绑定）
 */
type BindingDelegate = 'table' | 'pagination' | 'form-element'

/**
 * 组件绑定行为描述符
 *
 * 声明一个组件类型在绑定管线中的角色和特征。
 * 所有字段均为可选——未声明的特征默认为 false / undefined。
 */
export interface ComponentBindingDescriptor {
  /**
   * 数据绑定委托类型
   *
   * 决定 `dispatchDataKeyBinding` 将 dataKey 交给哪个委托处理：
   * - `'table'` → bindTableRule（el-table）
   * - `'pagination'` → bindPaginationRule（el-pagination）
   * - `'form-element'` → bindFormElementRule（el-input / el-select / ...）
   * - 未声明 → 非自解析组件走 bindGenericDataKey，自解析组件跳过
   */
  bindingDelegate?: BindingDelegate

  /**
   * dataKey 自解析标记
   *
   * 自解析组件（r-table / r-form 等）：bindRules 透传 dataKey 到 props，
   * 组件自行 consume(PAGE_DATASET) 解析。
   *
   * @see ComponentRegistry.meta.dataKey — 注册表 meta 优先级更高
   */
  selfResolving?: boolean

  /**
   * 数据容器标记
   *
   * 数据容器（el-table / el-form / el-descriptions）解析 dataKey 得到 DataSource，
   * 并通过 BindingContext 向子组件传递。
   */
  dataContainer?: boolean

  /**
   * 字段提供者标记
   *
   * 字段提供者（el-table-column / el-form-item / el-descriptions-item）
   * 通过 `prop` 属性声明子组件对应的数据字段名。
   */
  fieldProvider?: boolean

  /**
   * 选项映射支持
   *
   * 选项类组件（el-select / el-radio-group / el-checkbox-group / el-cascader / el-tree-select）
   * 需要从 DataView.rows 映射 options 数组。
   */
  hasOptions?: boolean

  /**
   * 值类型（仅 bindingDelegate='form-element' 时有效）
   *
   * 决定 modelValue 双向绑定的类型适配：
   * - `'string'`（默认）：DataView.value 直接绑定
   * - `'boolean'`：'true'|'1' → true，其余 → false
   * - `'array'`：按 selectionDelimiter 拆分为字符串数组
   */
  valueType?: 'string' | 'boolean' | 'array'

  /**
   * 操作组件标记（权限委托用）
   *
   * 操作组件（el-button / el-link）根据 permAction 控制可见性。
   */
  actionComponent?: boolean

  /**
   * 列容器标记（权限委托用）
   *
   * 列容器（el-table-column / el-descriptions-item）根据实例级权限隐藏整列。
   */
  columnLike?: boolean
}

// ── 内部存储 ──────────────────────────────────────────────────────────────

const _registry = new Map<string, ComponentBindingDescriptor>()

// ── 内置组件注册 ─────────────────────────────────────────────────────────

/** 批量注册辅助 */
function _batch(types: readonly string[], descriptor: ComponentBindingDescriptor): void {
  for (const type of types) {
    _registry.set(type, descriptor)
  }
}

// ── 表格 & 分页 ──
_registry.set('el-table', { bindingDelegate: 'table', dataContainer: true })
_registry.set('el-pagination', { bindingDelegate: 'pagination' })

// ── 数据容器（无专用委托，但需传递 DataSource） ──
_batch(['el-form', 'el-descriptions'], { dataContainer: true })

// ── 字段提供者 ──
_batch(['el-table-column', 'el-form-item', 'el-descriptions-item'], { fieldProvider: true })

// ── 操作组件 ──
_batch(['el-button', 'el-link'], { actionComponent: true })

// ── 列容器（权限用，与 fieldProvider 重叠但语义不同） ──
// el-table-column 同时是 fieldProvider + columnLike；el-descriptions-item 同理
_registry.set('el-table-column', { fieldProvider: true, columnLike: true })
_registry.set('el-descriptions-item', { fieldProvider: true, columnLike: true })

// ── 值型表单组件 ──
// 文本类
_batch(
  ['el-input', 'el-textarea', 'el-input-number', 'el-autocomplete'],
  { bindingDelegate: 'form-element', valueType: 'string' },
)

// 选项类（单值）
_batch(
  ['el-select', 'el-cascader', 'el-tree-select'],
  { bindingDelegate: 'form-element', hasOptions: true, valueType: 'string' },
)

// 选项类（单值 radio）
_registry.set('el-radio-group', { bindingDelegate: 'form-element', hasOptions: true, valueType: 'string' })

// 选项类（多值）
_registry.set('el-checkbox-group', { bindingDelegate: 'form-element', hasOptions: true, valueType: 'array' })
_registry.set('el-transfer', { bindingDelegate: 'form-element', valueType: 'array' })

// 布尔值
_registry.set('el-switch', { bindingDelegate: 'form-element', valueType: 'boolean' })

// 其他值型（默认 string）
_batch(
  ['el-slider', 'el-rate', 'el-date-picker', 'el-time-picker', 'el-time-select', 'el-color-picker'],
  { bindingDelegate: 'form-element', valueType: 'string' },
)

// ── r-* 自解析容器 ──
_batch(
  ['r-table', 'r-form', 'r-detail', 'r-tree', 'r-list',
   'r-tabs', 'r-collapse', 'r-dialog', 'r-drawer', 'r-steps',
   'r-section', 'r-block'],
  { selfResolving: true },
)

// ── 公共 API ──────────────────────────────────────────────────────────────

/**
 * 注册组件绑定描述符（扩展点）
 *
 * 第三方组件库或应用层调用此函数声明组件在绑定管线中的行为：
 * ```typescript
 * registerBindingDescriptor('vxe-table', { bindingDelegate: 'table', dataContainer: true })
 * ```
 *
 * 已注册的描述符会被新注册覆盖（后胜先）。
 */
export function registerBindingDescriptor(type: string, descriptor: ComponentBindingDescriptor): void {
  _registry.set(type, descriptor)
}

/**
 * 从 catalog bindingDescriptors 批量初始化注册表
 *
 * 构建时 component-catalog.json 的 `bindingDescriptors` 字段包含所有组件的绑定行为。
 * 运行时调用此函数可将 catalog 数据加载进内存注册表，替代硬编码默认值。
 *
 * 策略：catalog 条目覆盖内置默认值（后胜先），已通过 `registerBindingDescriptor()` 手动注册的条目保留。
 *
 * @param descriptors catalog.bindingDescriptors（type → descriptor 映射）
 */
export function initFromCatalogDescriptors(descriptors: Record<string, ComponentBindingDescriptor>): void {
  for (const [type, descriptor] of Object.entries(descriptors)) {
    _registry.set(type, descriptor)
  }
}

/** 获取组件的绑定描述符（无注册时返回 undefined） */
export function getBindingDescriptor(type: string): ComponentBindingDescriptor | undefined {
  return _registry.get(type)
}

// ── 谓词查询（替代散落在各文件的硬编码 Set） ─────────────────────────────

/** 获取绑定委托类型（dispatchDataKeyBinding 使用） */
export function getBindingDelegate(type: string): BindingDelegate | undefined {
  return _registry.get(type)?.bindingDelegate
}

/**
 * 检查组件是否为 dataKey 自解析类型
 *
 * 优先级：ComponentRegistry.meta.dataKey > 绑定注册表 > false
 */
export function isSelfResolvingType(type: string, registry?: ComponentRegistry): boolean {
  // 优先查询组件注册表 meta（用户注册时显式声明）
  if (registry) {
    const behavior = registry.get(type)?.meta?.['dataKey'] as string | undefined
    if (behavior !== undefined) return behavior === 'self-resolve'
  }
  return _registry.get(type)?.selfResolving === true
}

/** 是否为值型表单组件（bindingDelegate === 'form-element'） */
export function isFormElementType(type: string): boolean {
  return _registry.get(type)?.bindingDelegate === 'form-element'
}

/** 是否支持选项映射（el-select / el-radio-group / el-checkbox-group 等） */
export function isOptionsType(type: string): boolean {
  return _registry.get(type)?.hasOptions === true
}

/** 是否为多值组件（modelValue 为数组） */
export function isMultiValueType(type: string): boolean {
  return _registry.get(type)?.valueType === 'array'
}

/** 是否为布尔值组件（el-switch） */
export function isBooleanValueType(type: string): boolean {
  return _registry.get(type)?.valueType === 'boolean'
}

/** 是否为数据容器（向子组件传递 DataSource） */
export function isDataContainerType(type: string): boolean {
  return _registry.get(type)?.dataContainer === true
}

/** 是否为字段提供者（prop 属性表示字段名） */
export function isFieldProviderType(type: string): boolean {
  return _registry.get(type)?.fieldProvider === true
}

/** 是否为操作组件（el-button / el-link） */
export function isActionComponentType(type: string): boolean {
  return _registry.get(type)?.actionComponent === true
}

/** 是否为列容器（el-table-column / el-descriptions-item） */
export function isColumnLikeType(type: string): boolean {
  return _registry.get(type)?.columnLike === true
}
