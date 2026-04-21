/**
 * SparkNode 组件知识目录 (SparkNode Component Catalog)
 *
 * 本文件是 stills.queryActionSpec 协议下的知识投影层，不持有任何执行逻辑。
 * 唯一事实源为 component-catalog.json，运行时自动投影为两条 LLM 可查询知识条目：
 *   - SparkNode.containers —— 非字段类容器/功能型组件列表与配置指南
 *   - SparkNode.fields     —— 数据字段组件列表与配置指南
 *
 * 设计约定：
 * 1. 组件类型列表严格来自 component-catalog.registry，禁止在本文件手写维护；
 * 2. 单组件 props / emits / binding / 最小配置示例全部由 catalog-projections 投影生成；
 * 3. props 中的嵌套 schema（schemaRef / schema）会被递归展开，LLM 可直接阅读到完整结构；
 * 4. LLM 标准使用流程：查组件列表 → 选 type → 查 props → 构造 SparkNode → 调 SparkNodeTree FC 写入子树。
 */

// ══════════════════════════════════════════════════════════════
// 第一部分：依赖导入 (Imports)
// ══════════════════════════════════════════════════════════════

import componentCatalogJson from '../catalog/component-catalog.json'
import { projectFcConfigGuide, projectFcSpec, projectHydratedComponent } from '../catalog/catalog-projections'
import type { HydratedPropEntry } from '../catalog/catalog-projections'
import type { ComponentCatalog, PropSchema } from '../catalog/types'

// ══════════════════════════════════════════════════════════════
// 第二部分：接口定义 (Types)
// 描述本文件对外暴露的知识条目格式，与 queryActionSpec 协议对齐
// ══════════════════════════════════════════════════════════════

/**
 * 知识条目内的单条失败模式描述。
 * LLM 在遇到异常时可参照 code/when/fix 三元组进行自我诊断和修正。
 */
export interface SparkNodeComponentFailureMode {
  /** 错误码，用于在 LLM 推理链中快速定位失败场景 */
  code: string
  /** 触发该失败的典型场景描述 */
  when: string
  /** 推荐修正策略 */
  fix: string
}

/**
 * SparkNode 组件知识条目（对应 queryActionSpec 一条能力记录）。
 *
 * capabilityId 与 stills 协议保持兼容，但内容完全由 component-catalog.json 自动投影生成，
 * 不允许手工编辑。
 */
export interface SparkNodeComponentEntry {
  /** 能力标识，与 stills 协议 capabilityId 一一对应，如 'SparkNode.containers' */
  capabilityId: string
  /** 该知识条目的自然语言描述 */
  description: string
  /**
   * 参数规格对象，包含组件列表、建模流程提示以及每个组件的 props 配置摘要。
   * 所有嵌套 schema 引用已被递归展开，LLM 可直接阅读而无需二次查询。
   */
  paramsSchema: Record<string, unknown>
  /** 使用规则列表，告知 LLM 在构造 SparkNode 时的关键约束 */
  usageRules: string[]
  /** 常见失败模式列表，辅助 LLM 进行推理过程中的自我修正 */
  failureModes: SparkNodeComponentFailureMode[]
}

// ══════════════════════════════════════════════════════════════
// 第三部分：单一事实源加载 (Single Source of Truth)
// ══════════════════════════════════════════════════════════════

/**
 * 全局唯一的组件目录实例。
 * 类型强转是安全的：component-catalog.json 由构建管道强制遵循 ComponentCatalog schema。
 */
const COMPONENT_CATALOG = componentCatalogJson as ComponentCatalog

/**
 * fail-fast 守卫：确认 catalog 中存在 registry 注册表。
 * 如果目录来源不规范（缺少 registry），立即抛出，避免生成空知识条目欺骗 LLM。
 */
function requireRegistry(catalog: ComponentCatalog) {
  if (catalog.registry === undefined) {
    throw new Error('component-catalog registry 缺失：无法生成 SparkNode 组件知识条目')
  }
  return catalog.registry
}

// ══════════════════════════════════════════════════════════════
// 第四部分：Props 格式化与 Schema 递归展开 (Props Formatting & Schema Expansion)
// 将 catalog 中的属性描述转为 LLM 易读的摘要字符串或嵌套对象结构
// ══════════════════════════════════════════════════════════════

/**
 * 将属性的基础元信息（类型/必填/默认值/描述）序列化为单行摘要字符串。
 * 本函数是 formatPropSummary 的基础层，也被 schema.object 的子属性格式化复用。
 *
 * 输出示例：`【必填】 string；默认值=left；水平对齐方式`
 */
function formatBaseSummary(prop: {
  type: string
  required?: boolean
  default?: string
  description?: string
}): string {
  const requiredHint = prop.required ? '【必填】' : '【可选】'
  const defaultHint = prop.default !== undefined ? `；默认值=${prop.default}` : ''
  const descriptionHint = prop.description !== undefined ? `；${prop.description}` : ''
  return `${requiredHint} ${prop.type}${defaultHint}${descriptionHint}`
}

/**
 * 将 PropSchema 的各种结构（object / enum / array / event）转换为更易阅读的格式。
 *
 * - object：展开为 `{ 属性名: 摘要字符串 }` 对象，子属性调用 formatBaseSummary；
 * - enum：合并为 `"a" | "b" | "c"` 字面量字符串；
 * - array：展开为 `Array<type1 | type2>` 文字说明；
 * - event：展开为 `Event(param1, param2)` 签名说明；
 * - 其他未知结构返回 null，调用方负责降级处理。
 *
 * @param schema  已水合的 schema 结构
 */
function formatPropSchema(schema: PropSchema): unknown {
  switch (schema.kind) {
    case 'object': {
      // object schema：将 properties 每一项打平为摘要字符串，输出为对象形式方便 LLM 阅读字段含义
      const entries = Object.entries(schema.properties).map(([k, v]) => [k, formatBaseSummary(v)])
      return Object.fromEntries(entries)
    }
    case 'enum':
      // enum schema：将所有枚举变体合为一行，直接看到可选值范围
      return schema.variants.join(' | ')
    case 'array':
      // array schema：描述数组元素的可选类型
      return `Array<${schema.itemTypes.join(' | ')}>`
    case 'event':
      // event schema：描述事件参数签名
      return `Event(${schema.paramTypes.join(', ')})`
    default:
      return null
  }
}

/**
 * 针对单个属性项生成完整的摘要描述，并递归展开嵌套的 schema 或组件引用。
 *
 * 递归策略：
 * 1. 若属性的 schemaRef 格式为 `component:<type>`，代表该属性的值是另一个 SparkNode 组件配置结构，
 *    此时会递归展开该目标组件的全部 props，以 `{ _类型摘要, ...子props }` 的形式返回；
 * 2. 若属性直接携带 schema（非组件引用），则尝试通过 formatPropSchema 格式化，
 *    object 类型继续展开子属性，其他类型附加在摘要字符串末尾；
 * 3. 无嵌套信息时退化为 formatBaseSummary 的单行摘要字符串；
 * 4. 递归深度超过 2 层时强制截断，避免因循环引用或超深嵌套造成输出爆炸。
 *
 * @param prop    已水合的属性记录（含可选 schema 字段）
 * @param catalog 全局目录，用于 component: 引用场景下递归查询子组件
 * @param depth   当前递归深度，初始为 0，由调用方传入
 */
function formatPropSummary(prop: HydratedPropEntry, catalog: ComponentCatalog, depth = 0): unknown {
  // 先生成基础摘要字符串（不含 schema 展开内容），作为所有分支的兜底描述
  const baseType = formatBaseSummary(prop)

  // 超过最大递归深度，截断返回基础摘要，防止爆炸
  if (depth > 2) return baseType

  // 情形一：schemaRef 指向另一个组件（component:r-toolbar 等），递归展开该组件的 props
  if (typeof prop.schemaRef === 'string' && prop.schemaRef.startsWith('component:')) {
    const targetType = prop.schemaRef.slice('component:'.length)
    const targetEntry = projectHydratedComponent(catalog, targetType)
    if (targetEntry) {
      const nestedProps = Object.fromEntries(
        targetEntry.props.map((p) => [p.name, formatPropSummary(p, catalog, depth + 1)]),
      )
      return {
        _类型摘要: baseType,    // 保留顶层摘要字符串，方便 LLM 了解该属性本身的元信息
        ...nestedProps,         // 展开子组件的全部 props，LLM 可直接填写嵌套结构
      }
    }
  }

  // 情形二：属性本身携带了 schema 定义，尝试格式化展开
  if (prop.schema) {
    const parsedSchema = formatPropSchema(prop.schema)
    // object schema：合并到顶层对象，LLM 可直接看到所有子字段
    if (parsedSchema !== null && typeof parsedSchema === 'object' && !Array.isArray(parsedSchema)) {
      return { _类型摘要: baseType, ...parsedSchema }
    }
    // 其他 schema（enum/array/event）：附加约束说明到摘要字符串末尾
    if (parsedSchema !== null) {
      return `${baseType} （Schema约束=${parsedSchema}）`
    }
  }

  // 情形三：无任何 schema 信息，返回基础摘要字符串
  return baseType
}

// ══════════════════════════════════════════════════════════════
// 第五部分：组件指南构建 (Component Guide Builders)
// 将单组件投影结果聚合为 LLM 可直接参考的组件配置指南对象
// ══════════════════════════════════════════════════════════════

/**
 * 为单个组件类型构建一份完整的 LLM 配置指南对象。
 *
 * 指南包含：
 * - category / 说明：组件分类与自然语言描述；
 * - props：全部属性的递归摘要（含 schema 展开）；
 * - 必填属性 / 可选属性：分组属性名列表；
 * - emits / binding / rootFieldPaths：事件、数据绑定、字段路径信息（按需附加）；
 * - 最小配置：带有必填字段占位值的最小可用 SparkNode 示例；
 * - failFastChecks：构造/写入前必须满足的自检清单。
 *
 * 若组件不存在于 catalog，返回包含说明字段的错误对象，以便 LLM 感知目录漂移问题。
 *
 * @param componentType  要构建指南的组件 type 值（如 'r-table'）
 */
function buildPerComponentGuide(componentType: string): Record<string, unknown> {
  const spec = projectFcSpec(COMPONENT_CATALOG, componentType)
  const guide = projectFcConfigGuide(COMPONENT_CATALOG, componentType)
  const hydrated = projectHydratedComponent(COMPONENT_CATALOG, componentType)

  // 三个投影同时成功才有意义；任一为 null 说明目录生成链存在漂移
  if (spec === null || guide === null || hydrated === null) {
    return {
      说明: 'component-catalog 中未找到该组件，说明目录生成链存在漂移。',
    }
  }

  // 对每个属性调用递归展开，含 schema 引用和嵌套组件引用的属性会被深度打平
  const props = Object.fromEntries(
    hydrated.props.map((prop) => [prop.name, formatPropSummary(prop, COMPONENT_CATALOG)]),
  )

  return {
    category: spec.category ?? 'feature',
    说明: spec.description,
    ...(Object.keys(props).length > 0 ? { props } : {}),
    ...(guide.requiredProps.length > 0
      ? { 必填属性: guide.requiredProps.map((prop) => prop.name) }
      : {}),
    ...(guide.optionalProps.length > 0
      ? { 可选属性: guide.optionalProps.map((prop) => prop.name) }
      : {}),
    ...(spec.emits.length > 0
      ? { emits: spec.emits.map((emit) => emit.name) }
      : {}),
    ...(spec.binding !== undefined ? { binding: spec.binding } : {}),
    ...(guide.rootFieldPaths !== undefined && guide.rootFieldPaths.length > 0
      ? { rootFieldPaths: guide.rootFieldPaths }
      : {}),
    最小配置: guide.minimalConfig,
    failFastChecks: guide.failFastChecks,
  }
}

/**
 * 批量为多个组件类型生成指南映射表。
 * 结果按组件 type 字母序排列，确保同等输入的输出结果稳定（幂等性）。
 *
 * @param componentTypes  组件 type 列表（来自 registry.containers 或 registry.fields）
 * @returns               `{ [type]: 组件配置指南对象 }` 键值映射
 */
function buildComponentGuideMap(componentTypes: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    [...componentTypes]
      .sort((a, b) => a.localeCompare(b))
      .map((componentType) => [componentType, buildPerComponentGuide(componentType)]),
  )
}

// ══════════════════════════════════════════════════════════════
// 第六部分：知识条目生成 (Knowledge Entry Builders)
// 生成符合 stills.queryActionSpec 协议的完整 SparkNodeComponentEntry 对象
// ══════════════════════════════════════════════════════════════

/**
 * 生成 SparkNode.containers 知识条目。
 *
 * 覆盖范围：component-catalog.registry.containers 中登记的全部非字段类组件，
 * 包括布局容器（r-form / r-table / r-card…）和功能型组件（r-button / r-dialog…）。
 *
 * paramsSchema 包含：
 * - _来源 / _组件列表 / _说明 / _建模流程：元信息与使用引导；
 * - 以组件 type 为键的详细配置指南对象（由 buildComponentGuideMap 生成）。
 */
function buildContainersEntry(): SparkNodeComponentEntry {
  const registry = requireRegistry(COMPONENT_CATALOG)
  const componentTypes = [...registry.containers].sort((a, b) => a.localeCompare(b))

  return {
    capabilityId: 'SparkNode.containers',
    description: 'SparkNode 非字段组件列表与配置摘要（自动投影自 component-catalog.json）',
    paramsSchema: {
      _来源: 'packages/spark-ai/src/catalog/component-catalog.json',
      _组件列表: componentTypes,
      _说明: '这里严格以 component-catalog.registry.containers 为准，不再手写维护组件清单。',
      _建模流程: [
        '先从 _组件列表 中选择目标组件 type。',
        '再通过 queryComponentCatalog(type) 查看该组件完整 props / emits / binding 规格。',
        '根据规格构造 SparkNode：{ type, props, children? }。',
        '最后调用 SparkNodeTree.addNode / addNodes / replaceNode 等 FC，把该 SparkNode 写入当前子树。',
      ],
      ...buildComponentGuideMap(componentTypes),
    },
    usageRules: [
      '组件列表以 component-catalog.json 为唯一事实源；新增/删除组件应先改生成链，而不是手改本文件。',
      '使用组件前，必须先确认组件 type 存在，再查询单组件 props 规格。',
      '构造 SparkNode 时，children 是否需要传入取决于组件自身语义；不要默认给所有组件都加 children。',
      '把节点放入树中时，应通过 SparkNodeTree FC 完成，而不是直接手改整棵 SparkNode JSON。',
    ],
    failureModes: [
      {
        code: 'COMPONENT_NOT_FOUND',
        when: '选择的组件 type 不在自动投影出的组件列表中',
        fix: '先查看 _组件列表 或调用 queryComponentCatalog(type) 确认组件存在。',
      },
      {
        code: 'PROP_NOT_SUPPORTED',
        when: '传入了该组件不支持的 props，或 props 类型不符合组件规格',
        fix: '使用前先查询单组件 props 规格，严格按 component-catalog 描述构造 props。',
      },
      {
        code: 'TREE_WRITE_MISMATCH',
        when: 'SparkNode 已构造完成，但写入 SparkNodeTree 时 parentId / index / node 结构不合法',
        fix: '把"组件配置"与"树写入参数"分开处理：先构造 node，再调用 SparkNodeTree FC。',
      },
    ],
  }
}

/**
 * 生成 SparkNode.fields 知识条目。
 *
 * 覆盖范围：component-catalog.registry.fields 中登记的全部字段类组件，
 * 包括文本/数字/日期等输入字段、选择器、标签展示等。
 *
 * paramsSchema 除包含标准元信息外，还额外说明了 field / label 两个通用字段语义，
 * 但最终以各组件的单组件规格为最高优先级。
 */
function buildFieldsEntry(): SparkNodeComponentEntry {
  const registry = requireRegistry(COMPONENT_CATALOG)
  const componentTypes = [...registry.fields].sort((a, b) => a.localeCompare(b))

  return {
    capabilityId: 'SparkNode.fields',
    description: 'SparkNode 字段组件列表与配置摘要（自动投影自 component-catalog.json）',
    paramsSchema: {
      field: 'string — 绑定字段名；是否必需、如何生效以具体字段组件规格为准。',
      label: 'string — 展示标签；是否必需、在哪个宿主上下文中生效以具体字段组件规格为准。',
      props: 'object — 组件特有属性；必须以 component-catalog 中该字段组件的 props 规格为准。',
      _来源: 'packages/spark-ai/src/catalog/component-catalog.json',
      _字段组件列表: componentTypes,
      _建模流程: [
        '先从 _字段组件列表 中选择字段组件 type。',
        '再通过 queryComponentCatalog(type) 查看字段组件 props 规格。',
        '构造 SparkNode：{ type, props: { field, label, ...组件特有属性 } }。',
        '最后把该 SparkNode 放入已有数据容器或其它合适的 SparkNodeTree 位置。',
      ],
      ...buildComponentGuideMap(componentTypes),
    },
    usageRules: [
      '字段组件列表严格来自 component-catalog.registry.fields，本文件不再手写字段组件白名单。',
      'field / label 是常见字段组件配置，但每个字段组件真正支持的 props 仍以单组件规格为准。',
      '字段组件是组件配置 schema，不是 FC 参数；真正写入树时仍应调用 SparkNodeTree FC。',
      '构造字段节点后，应放入合适的父节点位置，特别是表格、表单、详情等数据容器中。',
    ],
    failureModes: [
      {
        code: 'FIELD_COMPONENT_NOT_FOUND',
        when: '字段组件 type 不在自动投影出的字段组件列表中',
        fix: '先查看 _字段组件列表 或调用 queryComponentCatalog(type) 确认组件存在。',
      },
      {
        code: 'FIELD_PROP_NOT_SUPPORTED',
        when: '传入了字段组件不支持的 props',
        fix: '按 component-catalog 中的单组件 props 规格构造字段节点，不要猜测组件属性。',
      },
      {
        code: 'FIELD_WRITE_TO_WRONG_PARENT',
        when: '字段节点写入到不合适的 SparkNodeTree 位置，导致不渲染或行为异常',
        fix: '先确认目标父节点，再把字段 SparkNode 写入对应数据容器或允许承载字段的节点下。',
      },
    ],
  }
}

// ══════════════════════════════════════════════════════════════
// 第七部分：对外导出 (Exports)
// 向 stills 运行时暴露两条知识条目及其查询入口
// ══════════════════════════════════════════════════════════════

/**
 * 全量 SparkNode 组件知识条目列表（模块加载时一次性计算）。
 *
 * 当前包含两条：
 * - SparkNode.containers：容器与功能型组件知识库
 * - SparkNode.fields：字段组件知识库
 *
 * readonly 修饰符确保运行时不会被意外修改。
 */
export const SPARK_NODE_COMPONENT_ENTRIES: readonly SparkNodeComponentEntry[] = [
  buildContainersEntry(),
  buildFieldsEntry(),
]

/**
 * 按 capabilityId 查询单条知识条目。
 *
 * 供 stills.queryActionSpec 调用，根据 LLM 请求的能力 ID 返回对应的组件知识对象。
 * 未命中时返回 undefined，由调用方决定降级策略（通常返回空响应而非抛出）。
 *
 * @param capabilityId  能力标识，如 'SparkNode.containers' / 'SparkNode.fields'
 */
export function getSparkNodeComponentEntry(capabilityId: string): SparkNodeComponentEntry | undefined {
  return SPARK_NODE_COMPONENT_ENTRIES.find((entry) => entry.capabilityId === capabilityId)
}
