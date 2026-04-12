/**
 * 组件绑定行为推断
 *
 * 两条路径产出绑定描述符：
 * 1. el-* 静态映射（Element Plus 组件不在 VCM 扫描范围内）
 * 2. r-* / 自定义组件：从 VCM 提取的 props 自动推断
 *
 * 产出写入 component-catalog.json 供 AI 和运行时消费。
 *
 * @module infer-binding
 */

import type { CatalogBindingDescriptor, PropEntry, ComponentEntry } from './component-catalog-schema'

/* --------------------------------------------------------------------------
 * el-* 静态描述符（SSoT — 与运行时 component-binding-registry 硬编码完全对齐）
 * ----------------------------------------------------------------------- */

export const EL_BINDING_DESCRIPTORS: Readonly<Record<string, CatalogBindingDescriptor>> = {
  // ── 表格 & 分页 ──
  'el-table': { bindingDelegate: 'table', dataContainer: true },
  'el-pagination': { bindingDelegate: 'pagination' },

  // ── 数据容器（无专用委托，需传递 DataSource） ──
  'el-form': { dataContainer: true },
  'el-descriptions': { dataContainer: true },

  // ── 字段提供者 ──
  'el-table-column': { fieldProvider: true, columnLike: true },
  'el-form-item': { fieldProvider: true },
  'el-descriptions-item': { fieldProvider: true, columnLike: true },

  // ── 操作组件 ──
  'el-button': { actionComponent: true },
  'el-link': { actionComponent: true },

  // ── 值型表单组件：文本类 ──
  'el-input': { bindingDelegate: 'form-element', valueType: 'string' },
  'el-textarea': { bindingDelegate: 'form-element', valueType: 'string' },
  'el-input-number': { bindingDelegate: 'form-element', valueType: 'string' },
  'el-autocomplete': { bindingDelegate: 'form-element', valueType: 'string' },

  // ── 值型表单组件：选项类（单值） ──
  'el-select': { bindingDelegate: 'form-element', hasOptions: true, valueType: 'string' },
  'el-cascader': { bindingDelegate: 'form-element', hasOptions: true, valueType: 'string' },
  'el-tree-select': { bindingDelegate: 'form-element', hasOptions: true, valueType: 'string' },
  'el-radio-group': { bindingDelegate: 'form-element', hasOptions: true, valueType: 'string' },

  // ── 值型表单组件：选项类（多值） ──
  'el-checkbox-group': { bindingDelegate: 'form-element', hasOptions: true, valueType: 'array' },
  'el-transfer': { bindingDelegate: 'form-element', valueType: 'array' },

  // ── 值型表单组件：布尔值 ──
  'el-switch': { bindingDelegate: 'form-element', valueType: 'boolean' },

  // ── 值型表单组件：其他 ──
  'el-slider': { bindingDelegate: 'form-element', valueType: 'string' },
  'el-rate': { bindingDelegate: 'form-element', valueType: 'string' },
  'el-date-picker': { bindingDelegate: 'form-element', valueType: 'string' },
  'el-time-picker': { bindingDelegate: 'form-element', valueType: 'string' },
  'el-time-select': { bindingDelegate: 'form-element', valueType: 'string' },
  'el-color-picker': { bindingDelegate: 'form-element', valueType: 'string' },
}

/* --------------------------------------------------------------------------
 * VCM Props → 绑定行为推断
 * ----------------------------------------------------------------------- */

/**
 * 从 VCM 提取的 props 推断组件绑定行为
 *
 * 推断规则（优先级从高到低）：
 * 1. SFC @binding JSDoc 注解（显式声明）
 * 2. 有 `dataKey` prop → selfResolving
 * 3. container 类别 + dataKey + children(SparkNode[]) → dataContainer
 * 4. 有 `modelValue` prop → form-element delegate（按类型推断 valueType）
 * 5. 有 `options` 或 `optionKey` prop → hasOptions
 * 6. 有 `prop` prop → fieldProvider
 *
 * @param sfcBinding - SFC 内 @binding 注解值（优先于推断）
 * @returns 推断的描述符，无法推断时返回 undefined
 */
export function inferBindingFromVcm(
  type: string,
  props: PropEntry[],
  category: ComponentEntry['category'],
  sfcBinding?: string,
): CatalogBindingDescriptor | undefined {
  // el-* 走静态映射
  const elDescriptor = EL_BINDING_DESCRIPTORS[type]
  if (elDescriptor !== undefined) return elDescriptor

  // SFC @binding 注解优先（解析已知的声明式绑定模式）
  if (sfcBinding !== undefined) {
    return parseSfcBinding(sfcBinding, props, category)
  }

  const hasDataKey = props.some(p => p.name === 'dataKey')
  const hasChildren = props.some(p => p.name === 'children' && p.type.includes('SparkNode'))
  const hasModelValue = props.some(p => p.name === 'modelValue')
  const hasPropField = props.some(p => p.name === 'prop')
  const hasOptions = props.some(p => p.name === 'options' || p.name === 'optionKey')

  const descriptor: CatalogBindingDescriptor = {}
  let hasAnyField = false

  // 自解析：拥有 dataKey prop
  if (hasDataKey) {
    descriptor.selfResolving = true
    hasAnyField = true
  }

  // 数据容器：容器类别 + dataKey + children
  if (category === 'container' && hasDataKey && hasChildren) {
    descriptor.dataContainer = true
    hasAnyField = true
  }

  // 表单元素：拥有 modelValue prop
  if (hasModelValue) {
    descriptor.bindingDelegate = 'form-element'
    hasAnyField = true

    const mvProp = props.find(p => p.name === 'modelValue')
    if (mvProp !== undefined) {
      const mvType = mvProp.type.toLowerCase()
      if (mvType.includes('boolean')) descriptor.valueType = 'boolean'
      else if (mvType.includes('[]') || mvType.includes('array')) descriptor.valueType = 'array'
      else descriptor.valueType = 'string'
    }
  }

  // 选项支持
  if (hasOptions) {
    descriptor.hasOptions = true
    hasAnyField = true
  }

  // 字段提供者
  if (hasPropField) {
    descriptor.fieldProvider = true
    hasAnyField = true
  }

  return hasAnyField ? descriptor : undefined
}

/* --------------------------------------------------------------------------
 * 汇总：构建完整的 bindingDescriptors 映射
 * ----------------------------------------------------------------------- */

/**
 * 从 catalog entries + el-* 静态映射构建完整的 bindingDescriptors
 *
 * @param entries 已构建的 ComponentEntry 映射（含 binding 字段）
 * @returns 完整的 type → descriptor 映射
 */
export function buildAllBindingDescriptors(
  entries: Record<string, ComponentEntry>,
): Record<string, CatalogBindingDescriptor> {
  const result: Record<string, CatalogBindingDescriptor> = {}

  // 1. el-* 静态映射全量写入
  for (const [type, descriptor] of Object.entries(EL_BINDING_DESCRIPTORS)) {
    result[type] = descriptor
  }

  // 2. r-* / feature 组件从 entries.binding 写入
  for (const [type, entry] of Object.entries(entries)) {
    if (entry.binding !== undefined) {
      result[type] = entry.binding
    }
  }

  return result
}

/* --------------------------------------------------------------------------
 * SFC @binding 注解解析
 * ----------------------------------------------------------------------- */

/**
 * 将 SFC @binding 声明式文本解析为 CatalogBindingDescriptor
 *
 * 支持的声明值：
 * - `dataKey-driven` → selfResolving + dataContainer（容器时）
 * - `field-driven` → fieldProvider
 * - `form-element` → bindingDelegate: 'form-element'
 * - `action` → actionComponent
 * - `column` → fieldProvider + columnLike
 *
 * 可组合：`dataKey-driven, action` → 同时设多个标志
 */
function parseSfcBinding(
  sfcBinding: string,
  props: PropEntry[],
  category: ComponentEntry['category'],
): CatalogBindingDescriptor {
  const tokens = sfcBinding.split(',').map(t => t.trim().toLowerCase())
  const descriptor: CatalogBindingDescriptor = {}

  for (const token of tokens) {
    switch (token) {
      case 'datakey-driven':
        descriptor.selfResolving = true
        if (category === 'container') descriptor.dataContainer = true
        break
      case 'field-driven':
        descriptor.fieldProvider = true
        break
      case 'form-element':
        descriptor.bindingDelegate = 'form-element'
        break
      case 'action':
        descriptor.actionComponent = true
        break
      case 'column':
        descriptor.fieldProvider = true
        descriptor.columnLike = true
        break
    }
  }

  // 追加推断：hasOptions
  if (props.some(p => p.name === 'options' || p.name === 'optionKey')) {
    descriptor.hasOptions = true
  }

  return descriptor
}
