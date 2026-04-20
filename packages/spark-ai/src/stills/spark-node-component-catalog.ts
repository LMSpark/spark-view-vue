/**
 * SparkNode Component Catalog
 *
 * 这里不再手写维护 SparkNode 组件清单，而是把 component-catalog.json 视为唯一事实源，
 * 在运行时投影出 SparkNode.containers / SparkNode.fields 两条知识项。
 *
 * 设计原则：
 * 1. 组件列表严格来自 component-catalog.registry；
 * 2. 单组件 props / emits / binding / 最小配置示例来自 catalog-projections；
 * 3. 本文件只是 queryActionSpec 的知识投影层，不提供 execute 实现；
 * 4. LLM 使用流程固定为：查询组件列表 -> 选组件 type -> 查看组件 props -> 构造 SparkNode -> 调 SparkNodeTree FC 写入子树。
 */

// ── 1. 依赖导入 (Imports) ─────────────────────────────────────────────────────────

import componentCatalogJson from '../catalog/component-catalog.json'
import { projectFcConfigGuide, projectFcSpec } from '../catalog/catalog-projections'
import type { ComponentCatalog } from '../catalog/types'

// ── 2. 基础类型 (Types) ────────────────────────────────────────────────────────────

/** 通用失败模式。 */
export interface SparkNodeComponentFailureMode {
  code: string
  when: string
  fix: string
}

/**
 * SparkNode 组件知识条目。
 *
 * capabilityId 为兼容既有 queryActionSpec 协议保留；
 * 但其内容严格由 component-catalog.json 自动投影生成。
 */
export interface SparkNodeComponentEntry {
  capabilityId: string
  description: string
  paramsSchema: Record<string, unknown>
  usageRules: string[]
  failureModes: SparkNodeComponentFailureMode[]
}

type GeneratedComponentSpec = NonNullable<ReturnType<typeof projectFcSpec>>

// ── 3. 单一事实源 (Single Source of Truth) ───────────────────────────────────────

const COMPONENT_CATALOG = componentCatalogJson as ComponentCatalog

function requireRegistry(catalog: ComponentCatalog) {
  if (catalog.registry === undefined) {
    throw new Error('component-catalog registry 缺失：无法生成 SparkNode 组件知识条目')
  }
  return catalog.registry
}

// ── 4. 组件目录投影辅助 (Projection Helpers) ──────────────────────────────────────

function formatPropSummary(prop: GeneratedComponentSpec['props'][number]): string {
  const requiredHint = prop.required ? '【必填】' : '【可选】'
  const defaultHint = prop.default !== undefined ? `；默认值=${prop.default}` : ''
  const descriptionHint = prop.description !== undefined ? `；${prop.description}` : ''
  return `${requiredHint} ${prop.type}${defaultHint}${descriptionHint}`
}

function buildPerComponentGuide(componentType: string): Record<string, unknown> {
  const spec = projectFcSpec(COMPONENT_CATALOG, componentType)
  const guide = projectFcConfigGuide(COMPONENT_CATALOG, componentType)

  if (spec === null || guide === null) {
    return {
      说明: 'component-catalog 中未找到该组件，说明目录生成链存在漂移。',
    }
  }

  const props = Object.fromEntries(
    spec.props.map((prop) => [prop.name, formatPropSummary(prop)]),
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

function buildComponentGuideMap(componentTypes: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    [...componentTypes]
      .sort((a, b) => a.localeCompare(b))
      .map((componentType) => [componentType, buildPerComponentGuide(componentType)]),
  )
}

// ── 5. 知识条目生成 (Knowledge Entry Builders) ────────────────────────────────────

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
        fix: '把“组件配置”与“树写入参数”分开处理：先构造 node，再调用 SparkNodeTree FC。',
      },
    ],
  }
}

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

// ── 6. 对外导出 (Exports) ────────────────────────────────────────────────────────

export const SPARK_NODE_COMPONENT_ENTRIES: readonly SparkNodeComponentEntry[] = [
  buildContainersEntry(),
  buildFieldsEntry(),
]

export function getSparkNodeComponentEntry(capabilityId: string): SparkNodeComponentEntry | undefined {
  return SPARK_NODE_COMPONENT_ENTRIES.find((entry) => entry.capabilityId === capabilityId)
}
