/**
 * PageConfig Domain — 页面配置域
 *
 * 管理页面配置的 4 个记忆体：
 * - rule: SparkNode 树（对应 rule.json）
 * - scriptMap: 函数名→函数体（导出时拼接为 script.js 函数声明）
 * - scriptVars: 变量名→初始值表达式（导出时拼接为 script.js 顶层 let 声明）
 * - styleMap: CSS 选择器→声明块（导出时拼接为 style.css）
 *
 * DataView 上的组件注释（r-table / r-form 等）是给 LLM 的概念映射提示，
 * bootstrap 只创建空壳骨架，具体组件选择由 LLM 通过 stills 驱动。
 */

import type { SparkNode, SparkNodeChildren } from '@spark-view/spark-component'

import type {
  DomainProvider,
  IStillSession,
  StillDefinition,
  StillResult,
} from './types'
import {
  getPageConfigState,
  createPageConfigState,
  guardInitReady,
  guardInitReadyDesc,
  guardBootstrapped,
  guardBootstrappedDesc,
  guardDataOnly,
  guardDataOnlyDesc,
} from './pageconfig-types'
import type {
  PageConfigDomainState,
  IPageConfigData,
  PageConfigExportResult,
  PageConfigValidationIssue,
} from './pageconfig-types'
import { getDataSetState } from './dataset-domain'
import type { StillsCatalog, StillsComponentEntry } from '../catalog/stills-catalog-types'

// ═══════════════════════════════════════════════════════════
// 内部工具函数
// ═══════════════════════════════════════════════════════════

function missingParam(name: string): string {
  return `缺少必填参数: ${name}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Catalog 校验：类型存在性 + props 名称。
 * catalog 为 null 时跳过（降级模式）。
 */
function validateComponentAgainstCatalog(
  catalog: StillsCatalog | null,
  type: string,
  props?: Record<string, unknown>,
): StillResult | null {
  if (catalog === null) return null

  const entry: StillsComponentEntry | undefined = catalog.components[type]
  if (entry === undefined) {
    // 查找相似类型
    const allTypes = Object.keys(catalog.components)
    const candidates = allTypes
      .filter((t) => t.includes(type) || type.includes(t))
      .slice(0, 5)
    const hint = candidates.length > 0
      ? `相似组件: ${candidates.join(', ')}。`
      : `可用容器: ${catalog.registry.containers.join(', ')}; 可用字段: ${catalog.registry.fields.join(', ')}`
    return { ok: false, code: 'UNKNOWN_COMPONENT', msg: `未知组件类型 "${type}"。${hint}`, fix: '请用 catalog.query 查看可用组件列表' }
  }

  if (props !== undefined && entry.props.length > 0) {
    const validPropNames = new Set(entry.props.map((p) => p.name))
    const unknownProps = Object.keys(props).filter((k) => !validPropNames.has(k))
    if (unknownProps.length > 0) {
      return {
        ok: false,
        code: 'UNKNOWN_PROPS',
        msg: `组件 "${type}" 不支持 props: ${unknownProps.join(', ')}。合法 props: ${entry.props.map((p) => p.name).join(', ')}`,
        fix: `请用 catalog.query {"type":"${type}"} 查看该组件的合法 props`,
      }
    }
  }

  return null
}

/** 获取当前 pageconfig data，断言非 null */
function withPC<T>(session: IStillSession, op: (pc: IPageConfigData) => StillResult<T>): StillResult<T> {
  const state = getPageConfigState(session)
  if (state.data === null) {
    return { ok: false, code: 'NO_PAGECONFIG', msg: 'PageConfig 未初始化', fix: '先执行 pageconfig.init' }
  }
  return op(state.data)
}

/** 读取节点 id（从 props.id） */
function readId(node: SparkNode): string | undefined {
  const id = node.props?.['id']
  return typeof id === 'string' ? id : undefined
}

/** 递归查找节点 by id */
function findById(node: SparkNode, id: string): SparkNode | null {
  if (readId(node) === id) return node
  if (!Array.isArray(node.children)) return null
  for (const child of node.children) {
    if (typeof child === 'string' || typeof child === 'number') continue
    const found = findById(child, id)
    if (found !== null) return found
  }
  return null
}

/** 递归查找父节点 */
function findParent(root: SparkNode, targetId: string): SparkNode | null {
  if (!Array.isArray(root.children)) return null
  for (const child of root.children) {
    if (typeof child === 'string' || typeof child === 'number') continue
    if (readId(child) === targetId) return root
    const found = findParent(child, targetId)
    if (found !== null) return found
  }
  return null
}

/** 从父节点的 children 中移除目标（就地修改） */
function removeFromParent(parent: SparkNode, targetId: string): boolean {
  if (!Array.isArray(parent.children)) return false
  const index = parent.children.findIndex(
    (child) => typeof child !== 'string' && typeof child !== 'number' && readId(child) === targetId,
  )
  if (index === -1) return false
  parent.children.splice(index, 1)
  return true
}

/** 收集所有 event handler 函数名 */
function collectHandlerNames(node: SparkNode): Set<string> {
  const names = new Set<string>()
  walkHandlers(node, names)
  return names
}

function walkHandlers(node: SparkNode, out: Set<string>): void {
  const on = node.props?.['on'] as Record<string, string> | undefined
  if (on && typeof on === 'object') {
    for (const handlerName of Object.values(on)) {
      if (typeof handlerName === 'string' && handlerName.length > 0) out.add(handlerName)
    }
  }
  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    if (typeof child !== 'string' && typeof child !== 'number') walkHandlers(child, out)
  }
}

/** 收集所有 dataKey */
function collectDataKeys(node: SparkNode): Set<string> {
  const keys = new Set<string>()
  walkDataKeys(node, keys)
  return keys
}

function walkDataKeys(node: SparkNode, out: Set<string>): void {
  const dataKey = node.props?.['dataKey']
  if (typeof dataKey === 'string' && dataKey.length > 0) out.add(dataKey)
  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    if (typeof child !== 'string' && typeof child !== 'number') walkDataKeys(child, out)
  }
}

/** 生成唯一节点 id */
let _idSeq = 0
function nextNodeId(prefix = 'n'): string {
  return `${prefix}-${++_idSeq}`
}

/** 重置 id 计数（仅测试用） */
export function _resetIdSeq(): void {
  _idSeq = 0
}

// ═══════════════════════════════════════════════════════════
// Serialization helpers（导出用）
// ═══════════════════════════════════════════════════════════

/**
 * scriptVars + scriptMap → script.js 文本。
 *
 * 输出顺序：
 * 1. scriptVars → `let xxx = ...`（闭包变量，放最前）
 * 2. scriptMap（排除 __init__）→ `function name() { ... }`
 * 3. scriptMap['__init__'] → `function __init__() { ... }`（放最后）
 */
function serializeScript(vars: Record<string, string>, fns: Record<string, string>): string {
  const parts: string[] = []
  // 闭包变量
  for (const [k, v] of Object.entries(vars)) {
    parts.push(`let ${k} = ${v}`)
  }
  // 函数声明（排除 __init__）
  for (const [k, v] of Object.entries(fns)) {
    if (k !== '__init__') parts.push(`function ${k}() {\n${v}\n}`)
  }
  // __init__ 放最后
  if (fns['__init__'] !== undefined) {
    parts.push(`function __init__() {\n${fns['__init__']}\n}`)
  }
  return parts.join('\n\n')
}

/** styleMap → style.css 文本 */
function serializeStyleMap(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([sel, decl]) => `${sel} {\n${decl}\n}`)
    .join('\n\n')
}

// ═══════════════════════════════════════════════════════════
// Still: pageconfig.init
// ═══════════════════════════════════════════════════════════

interface PageConfigInitParams {
  /** 可选的根容器 type，默认 'div' */
  rootType?: string
}

const pageconfigInit: StillDefinition<PageConfigInitParams, IPageConfigData> = {
  action: 'pageconfig.init',
  type: 'request',
  description: '初始化 PageConfig 域——创建空壳骨架（根 SparkNode + 空 scriptMap/styleMap）。需要 Dataset 域已完成设计。',
  guard: guardInitReady,
  guardDescription: guardInitReadyDesc,
  usageRules: [
    'Dataset 域 phase 必须至少为 design（即已创建 DataSet）',
    'PageConfig 只能初始化一次',
  ],
  paramsSchema: {
    rootType: 'string? (默认 "div")',
  },
  example: {},
  validate: (params) => {
    if (params.rootType !== undefined && !isNonEmptyString(params.rootType)) {
      return 'rootType 必须是非空字符串'
    }
    return null
  },
  execute: (session, params): StillResult<IPageConfigData> => {
    const pcState = getPageConfigState(session)
    if (pcState.data !== null) {
      return { ok: false, code: 'ALREADY_INIT', msg: 'PageConfig 已初始化', fix: '无需重复执行 pageconfig.init' }
    }
    // 确保 Dataset 域已就绪
    const dsState = getDataSetState(session)
    if (dsState.data === null) {
      return { ok: false, code: 'NO_DATASET', msg: 'Dataset 域尚未初始化', fix: '先执行 dataset.init' }
    }

    const rootId = nextNodeId('root')
    const pc: IPageConfigData = {
      rule: {
        type: params.rootType ?? 'div',
        props: { id: rootId, class: 'page-root' },
        children: [],
      },
      scriptMap: {},
      scriptVars: {},
      styleMap: {},
    }
    pcState.data = pc
    pcState.phase = 'bootstrapped'
    return {
      ok: true,
      data: pc,
      summary: `PageConfig 初始化完成，根节点 id=${rootId}，type=${pc.rule?.type ?? 'div'}`,
    }
  },
}

// ═══════════════════════════════════════════════════════════
// Still: rule.addComponent
// ═══════════════════════════════════════════════════════════

interface AddComponentParams {
  parentId: string | null
  type: string
  id?: string
  props?: Record<string, unknown>
  children?: SparkNodeChildren
  position?: number
}

const ruleAddComponent: StillDefinition<AddComponentParams, { id: string }> = {
  action: 'rule.addComponent',
  type: 'request',
  description: '向组件树中添加一个 SparkNode。parentId=null 时添加到根节点的 children。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: {
    parentId: 'string | null — 父节点 id（null=根节点）',
    type: 'string — 组件类型（kebab-case）',
    id: 'string? — 自定义节点 id',
    props: 'Record<string, unknown>? — 组件 props',
    children: 'SparkNodeChildren? — 子节点',
    position: 'number? — 插入位置',
  },
  example: { parentId: null, type: 'r-table', props: { dataKey: 'Users@rows' } },
  validate: (params) => {
    if (!isNonEmptyString(params.type)) return missingParam('type')
    if (params.parentId !== null && !isNonEmptyString(params.parentId)) return 'parentId 必须是字符串或 null'
    return null
  },
  execute: (session, params): StillResult<{ id: string }> => {
    // catalog 校验（有 catalog 时启用）
    const catalogError = validateComponentAgainstCatalog(session.catalog, params.type, params.props)
    if (catalogError !== null) return catalogError as StillResult<{ id: string }>

    return withPC(session, (pc) => {
      const newId = params.id ?? nextNodeId(params.type)
      const newNode: SparkNode = {
        type: params.type,
        props: {
          id: newId,
          ...(params.props ?? {}),
        },
        ...(params.children !== undefined ? { children: params.children } : {}),
      }

      // 找到目标父节点
      const parent = params.parentId === null
        ? pc.rule
        : (pc.rule !== null ? findById(pc.rule, params.parentId) : null)
      if (parent === null) {
        return { ok: false, code: 'PARENT_NOT_FOUND', msg: `找不到父节点 ${params.parentId}`, fix: '确认 parentId 正确' }
      }

      if (!Array.isArray(parent.children)) parent.children = []
      const index = params.position !== undefined
        ? Math.min(params.position, parent.children.length)
        : parent.children.length
      parent.children.splice(index, 0, newNode)

      const state = getPageConfigState(session)
      if (state.phase === 'bootstrapped') state.phase = 'refining'

      return { ok: true, data: { id: newId }, summary: `添加 <${params.type}> id=${newId} → parent=${params.parentId ?? 'root'}` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: rule.setProps
// ═══════════════════════════════════════════════════════════

interface SetPropsParams {
  nodeId: string
  props: Record<string, unknown>
  merge?: boolean
}

const ruleSetProps: StillDefinition<SetPropsParams, void> = {
  action: 'rule.setProps',
  type: 'request',
  description: '设置/合并节点的 props。merge=true（默认）合并，merge=false 替换。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: {
    nodeId: 'string — 目标节点 id',
    props: 'Record<string, unknown> — 要设置的 props',
    merge: 'boolean? (默认 true) — 合并还是替换',
  },
  example: { nodeId: 'n-1', props: { border: true, stripe: true }, merge: true },
  validate: (params) => {
    if (!isNonEmptyString(params.nodeId)) return missingParam('nodeId')
    if (Object.keys(params.props).length === 0) return 'props 不能为空对象'
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      if (pc.rule === null) {
        return { ok: false, code: 'NO_RULE', msg: '组件树为空', fix: '先执行 pageconfig.init' }
      }
      const node = findById(pc.rule, params.nodeId)
      if (node === null) {
        return { ok: false, code: 'NODE_NOT_FOUND', msg: `找不到节点 ${params.nodeId}`, fix: '确认 nodeId 正确' }
      }

      // catalog props 校验
      const catalogError = validateComponentAgainstCatalog(session.catalog, node.type, params.props)
      if (catalogError !== null) return catalogError as StillResult<void>

      if (params.merge === false) {
        node.props = { ...params.props }
      } else {
        node.props = { ...(node.props ?? {}), ...params.props }
      }
      return { ok: true, data: undefined, summary: `节点 ${params.nodeId} props 已更新` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: rule.removeComponent
// ═══════════════════════════════════════════════════════════

interface RemoveComponentParams {
  nodeId: string
}

const ruleRemoveComponent: StillDefinition<RemoveComponentParams, void> = {
  action: 'rule.removeComponent',
  type: 'request',
  description: '从组件树中移除一个节点（及其所有子节点）。不可移除根节点。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: { nodeId: 'string — 要移除的节点 id' },
  validate: (params) => {
    if (!isNonEmptyString(params.nodeId)) return missingParam('nodeId')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      if (pc.rule === null) {
        return { ok: false, code: 'NO_RULE', msg: '组件树为空', fix: '先执行 pageconfig.init' }
      }
      if (readId(pc.rule) === params.nodeId) {
        return { ok: false, code: 'CANNOT_REMOVE_ROOT', msg: '不能移除根节点', fix: '移除根节点的子节点即可' }
      }
      const parent = findParent(pc.rule, params.nodeId)
      if (parent === null) {
        return { ok: false, code: 'NODE_NOT_FOUND', msg: `找不到节点 ${params.nodeId}`, fix: '确认 nodeId 正确' }
      }
      removeFromParent(parent, params.nodeId)
      return { ok: true, data: undefined, summary: `已移除节点 ${params.nodeId}` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: rule.reorder
// ═══════════════════════════════════════════════════════════

interface ReorderParams {
  parentId: string | null
  childIds: string[]
}

const ruleReorder: StillDefinition<ReorderParams, void> = {
  action: 'rule.reorder',
  type: 'request',
  description: '重新排列指定父节点下的子组件顺序。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: {
    parentId: 'string | null — 父节点 id（null=根节点）',
    childIds: 'string[] — 新的子节点 id 顺序',
  },
  validate: (params) => {
    if (params.parentId !== null && !isNonEmptyString(params.parentId)) return 'parentId 必须是字符串或 null'
    if (!Array.isArray(params.childIds) || params.childIds.length === 0) return missingParam('childIds')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      if (pc.rule === null) {
        return { ok: false, code: 'NO_RULE', msg: '组件树为空', fix: '先执行 pageconfig.init' }
      }
      const target = params.parentId === null
        ? pc.rule
        : findById(pc.rule, params.parentId)
      if (target === null) {
        return { ok: false, code: 'PARENT_NOT_FOUND', msg: `找不到父节点 ${params.parentId}`, fix: '确认 parentId' }
      }
      if (!Array.isArray(target.children)) {
        return { ok: false, code: 'NO_CHILDREN', msg: '目标节点没有子节点', fix: '先添加子节点' }
      }

      const nodeMap = new Map<string, SparkNode>()
      const textChildren: SparkNodeChildren = []
      for (const child of target.children) {
        if (typeof child === 'string' || typeof child === 'number') {
          textChildren.push(child)
        } else if (readId(child)) {
          const childId = readId(child) as string
          nodeMap.set(childId, child)
        }
      }

      const reordered: SparkNodeChildren = []
      for (const id of params.childIds) {
        const node = nodeMap.get(id)
        if (node) {
          reordered.push(node)
          nodeMap.delete(id)
        }
      }
      for (const [, node] of nodeMap) reordered.push(node)
      for (const textChild of textChildren) reordered.push(textChild)

      target.children = reordered
      return { ok: true, data: undefined, summary: `子节点已重排 (${params.childIds.length} items)` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: rule.setLayout
// ═══════════════════════════════════════════════════════════

interface SetLayoutParams {
  nodeId: string
  layout: Record<string, unknown>
}

const ruleSetLayout: StillDefinition<SetLayoutParams, void> = {
  action: 'rule.setLayout',
  type: 'request',
  description: '设置节点的布局属性（写入 props.style 或 props.class 等）。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: {
    nodeId: 'string — 目标节点 id',
    layout: 'Record<string, unknown> — 布局属性（style / class / flex 等）',
  },
  validate: (params) => {
    if (!isNonEmptyString(params.nodeId)) return missingParam('nodeId')
    if (Object.keys(params.layout).length === 0) return 'layout 不能为空对象'
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      if (pc.rule === null) {
        return { ok: false, code: 'NO_RULE', msg: '组件树为空', fix: '先执行 pageconfig.init' }
      }
      const node = findById(pc.rule, params.nodeId)
      if (node === null) {
        return { ok: false, code: 'NODE_NOT_FOUND', msg: `找不到节点 ${params.nodeId}`, fix: '确认 nodeId' }
      }
      node.props = { ...(node.props ?? {}), ...params.layout }
      return { ok: true, data: undefined, summary: `节点 ${params.nodeId} 布局已更新` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: script.addHandler
// ═══════════════════════════════════════════════════════════

interface ScriptAddHandlerParams {
  name: string
  body: string
}

const scriptAddHandler: StillDefinition<ScriptAddHandlerParams, void> = {
  action: 'script.addHandler',
  type: 'request',
  description: '向 scriptMap 添加一个事件处理函数。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: {
    name: 'string — 函数名',
    body: 'string — 函数体（不含 function 声明）',
  },
  example: { name: 'handleRowClick', body: 'const row = $dataSet?.getView("Orders", "default")?.currentRow\nconsole.log(row)' },
  validate: (params) => {
    if (!isNonEmptyString(params.name)) return missingParam('name')
    if (!isNonEmptyString(params.body)) return missingParam('body')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      pc.scriptMap[params.name] = params.body
      return { ok: true, data: undefined, summary: `script: 添加函数 ${params.name}` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: script.addInitLogic
// ═══════════════════════════════════════════════════════════

interface ScriptAddInitLogicParams {
  code: string
}

const scriptAddInitLogic: StillDefinition<ScriptAddInitLogicParams, void> = {
  action: 'script.addInitLogic',
  type: 'request',
  description: '向 __init__ 函数追加初始化代码段。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: { code: 'string — 要追加到 __init__ 的代码段' },
  validate: (params) => {
    if (!isNonEmptyString(params.code)) return missingParam('code')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      const existing = pc.scriptMap['__init__'] ?? ''
      const sep = existing.length > 0 ? '\n\n' : ''
      pc.scriptMap['__init__'] = existing + sep + params.code
      return { ok: true, data: undefined, summary: 'script: __init__ 已追加代码' }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: script.replaceHandler
// ═══════════════════════════════════════════════════════════

interface ScriptReplaceHandlerParams {
  name: string
  body: string
}

const scriptReplaceHandler: StillDefinition<ScriptReplaceHandlerParams, void> = {
  action: 'script.replaceHandler',
  type: 'request',
  description: '替换 scriptMap 中已有函数的函数体。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: {
    name: 'string — 函数名',
    body: 'string — 新函数体',
  },
  validate: (params) => {
    if (!isNonEmptyString(params.name)) return missingParam('name')
    if (!isNonEmptyString(params.body)) return missingParam('body')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      if (pc.scriptMap[params.name] === undefined) {
        return { ok: false, code: 'HANDLER_NOT_FOUND', msg: `函数 ${params.name} 不存在`, fix: '使用 script.addHandler 添加' }
      }
      pc.scriptMap[params.name] = params.body
      return { ok: true, data: undefined, summary: `script: 替换函数 ${params.name}` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: script.removeHandler
// ═══════════════════════════════════════════════════════════

interface ScriptRemoveHandlerParams {
  name: string
}

const scriptRemoveHandler: StillDefinition<ScriptRemoveHandlerParams, void> = {
  action: 'script.removeHandler',
  type: 'request',
  description: '从 scriptMap 中移除一个函数。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: { name: 'string — 函数名' },
  validate: (params) => {
    if (!isNonEmptyString(params.name)) return missingParam('name')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      if (pc.scriptMap[params.name] === undefined) {
        return { ok: false, code: 'HANDLER_NOT_FOUND', msg: `函数 ${params.name} 不存在`, fix: '确认函数名正确' }
      }
      const { [params.name]: _, ...rest } = pc.scriptMap
      pc.scriptMap = rest
      return { ok: true, data: undefined, summary: `script: 移除函数 ${params.name}` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: script.setVar
// ═══════════════════════════════════════════════════════════

interface ScriptSetVarParams {
  name: string
  value: string
}

const scriptSetVar: StillDefinition<ScriptSetVarParams, void> = {
  action: 'script.setVar',
  type: 'request',
  description: '设置/覆盖一个闭包公共变量（导出时生成 let 声明）。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: {
    name: 'string — 变量名',
    value: 'string — 初始值表达式（如 "null"、"[]"、"{ currentUser: null }"）',
  },
  example: { name: '_pageState', value: '{ selectedNode: null, loading: false }' },
  validate: (params) => {
    if (!isNonEmptyString(params.name)) return missingParam('name')
    if (typeof params.value !== 'string') return missingParam('value')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      pc.scriptVars[params.name] = params.value
      return { ok: true, data: undefined, summary: `script: 设置变量 ${params.name} = ${params.value}` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: script.removeVar
// ═══════════════════════════════════════════════════════════

interface ScriptRemoveVarParams {
  name: string
}

const scriptRemoveVar: StillDefinition<ScriptRemoveVarParams, void> = {
  action: 'script.removeVar',
  type: 'request',
  description: '移除一个闭包公共变量。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: { name: 'string — 变量名' },
  validate: (params) => {
    if (!isNonEmptyString(params.name)) return missingParam('name')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      if (pc.scriptVars[params.name] === undefined) {
        return { ok: false, code: 'VAR_NOT_FOUND', msg: `变量 ${params.name} 不存在`, fix: '确认变量名正确' }
      }
      const { [params.name]: _, ...rest } = pc.scriptVars
      pc.scriptVars = rest
      return { ok: true, data: undefined, summary: `script: 移除变量 ${params.name}` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: style.addRule
// ═══════════════════════════════════════════════════════════

interface StyleAddRuleParams {
  selector: string
  declarations: string
}

const styleAddRule: StillDefinition<StyleAddRuleParams, void> = {
  action: 'style.addRule',
  type: 'request',
  description: '向 styleMap 添加/替换一条 CSS 规则。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: {
    selector: 'string — CSS 选择器',
    declarations: 'string — CSS 声明块（不含花括号）',
  },
  example: { selector: '.page-root', declarations: 'padding: 16px;\nbackground: #fff;' },
  validate: (params) => {
    if (!isNonEmptyString(params.selector)) return missingParam('selector')
    if (!isNonEmptyString(params.declarations)) return missingParam('declarations')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      pc.styleMap[params.selector] = params.declarations
      return { ok: true, data: undefined, summary: `style: 添加规则 ${params.selector}` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: style.removeRule
// ═══════════════════════════════════════════════════════════

interface StyleRemoveRuleParams {
  selector: string
}

const styleRemoveRule: StillDefinition<StyleRemoveRuleParams, void> = {
  action: 'style.removeRule',
  type: 'request',
  description: '从 styleMap 中移除一条 CSS 规则。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: { selector: 'string — CSS 选择器' },
  validate: (params) => {
    if (!isNonEmptyString(params.selector)) return missingParam('selector')
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      if (pc.styleMap[params.selector] === undefined) {
        return { ok: false, code: 'RULE_NOT_FOUND', msg: `CSS 规则 ${params.selector} 不存在`, fix: '确认选择器正确' }
      }
      const { [params.selector]: _, ...rest } = pc.styleMap
      pc.styleMap = rest
      return { ok: true, data: undefined, summary: `style: 移除规则 ${params.selector}` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: style.setTheme
// ═══════════════════════════════════════════════════════════

interface StyleSetThemeParams {
  theme: Record<string, string>
}

const styleSetTheme: StillDefinition<StyleSetThemeParams, void> = {
  action: 'style.setTheme',
  type: 'request',
  description: '批量设置主题样式（用 CSS 变量）。写入 :root 选择器的声明。',
  guard: guardBootstrapped,
  guardDescription: guardBootstrappedDesc,
  paramsSchema: { theme: 'Record<string, string> — CSS 变量名→值映射' },
  example: { theme: { '--primary-color': '#409eff', '--font-size': '14px' } },
  validate: (params) => {
    if (Object.keys(params.theme).length === 0) return 'theme 不能为空对象'
    return null
  },
  execute: (session, params): StillResult<void> => {
    return withPC(session, (pc) => {
      const declarations = Object.entries(params.theme)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n')
      pc.styleMap[':root'] = declarations
      return { ok: true, data: undefined, summary: `style: 设置主题 (${Object.keys(params.theme).length} 个变量)` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: pageconfig.validate
// ═══════════════════════════════════════════════════════════

const pageconfigValidate: StillDefinition<Record<string, never>, PageConfigValidationIssue[]> = {
  action: 'pageconfig.validate',
  type: 'describe',
  description: '校验 PageConfig 一致性：组件树 dataKey 引用是否在 DataSet 中存在、事件处理器是否在 scriptMap 中定义。',
  guard: guardDataOnly,
  guardDescription: guardDataOnlyDesc,
  validate: () => null,
  execute: (session): StillResult<PageConfigValidationIssue[]> => {
    return withPC(session, (pc) => {
      const issues: PageConfigValidationIssue[] = []

      // 1. 检查 dataKey 是否对应 DataSet 中的表
      if (pc.rule !== null) {
        const dsState = getDataSetState(session)
        const ds = dsState.data
        const tableNames = ds !== null ? new Set(Object.keys(ds.tables)) : new Set<string>()

        const dataKeys = collectDataKeys(pc.rule)
        for (const dk of dataKeys) {
          // 提取 tableName（@分隔第一段，去掉 #scope 前缀）
          const raw = dk.startsWith('#') ? dk.slice(dk.indexOf('@') + 1) : dk
          const tableName = raw.split('@')[0] ?? ''
          if (tableName.length > 0 && ds !== null && !tableNames.has(tableName)) {
            issues.push({ rule: 'dataKey-table-exists', pass: false, detail: `dataKey "${dk}" 引用的表 "${tableName}" 不在 DataSet 中` })
          }
        }
        if (dataKeys.size > 0 && issues.filter((i) => i.rule === 'dataKey-table-exists' && !i.pass).length === 0) {
          issues.push({ rule: 'dataKey-table-exists', pass: true })
        }

        // 2. 检查 on 事件处理器在 scriptMap 中存在
        const handlers = collectHandlerNames(pc.rule)
        for (const h of handlers) {
          if (pc.scriptMap[h] === undefined) {
            issues.push({ rule: 'handler-defined', pass: false, detail: `事件处理器 "${h}" 未在 scriptMap 中定义` })
          }
        }
        if (handlers.size > 0 && issues.filter((i) => i.rule === 'handler-defined' && !i.pass).length === 0) {
          issues.push({ rule: 'handler-defined', pass: true })
        }
      }

      return { ok: true, data: issues, summary: `校验完成：${issues.filter((i) => !i.pass).length} 个问题` }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: pageconfig.export
// ═══════════════════════════════════════════════════════════

const pageconfigExport: StillDefinition<Record<string, never>, PageConfigExportResult> = {
  action: 'pageconfig.export',
  type: 'describe',
  description: '导出 PageConfig 为 rule.json + script.js + style.css 文本。',
  guard: guardDataOnly,
  guardDescription: guardDataOnlyDesc,
  validate: () => null,
  execute: (session): StillResult<PageConfigExportResult> => {
    return withPC(session, (pc) => {
      const ruleJson = pc.rule !== null ? JSON.stringify(pc.rule, null, 2) : '{}'
      const scriptJs = serializeScript(pc.scriptVars, pc.scriptMap)
      const styleCss = serializeStyleMap(pc.styleMap)

      const state = getPageConfigState(session)
      state.phase = 'exported'

      return {
        ok: true,
        data: { ruleJson, scriptJs, styleCss },
        summary: `导出完成: rule.json=${ruleJson.length}B, script.js=${scriptJs.length}B, style.css=${styleCss.length}B`,
      }
    })
  },
}

// ═══════════════════════════════════════════════════════════
// Still: pageconfig.describe
// ═══════════════════════════════════════════════════════════

const pageconfigDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: 'pageconfig.describe',
  type: 'describe',
  description: '描述当前 PageConfig 状态：组件树结构概览、scriptMap 函数列表、styleMap 选择器列表。',
  guard: guardDataOnly,
  guardDescription: guardDataOnlyDesc,
  validate: () => null,
  execute: (session): StillResult<unknown> => {
    return withPC(session, (pc) => {
      const nodeCount = pc.rule !== null ? countNodes(pc.rule) : 0
      const scriptFns = Object.keys(pc.scriptMap)
      const scriptVarNames = Object.keys(pc.scriptVars)
      const styleSelectors = Object.keys(pc.styleMap)

      return {
        ok: true,
        data: {
          phase: getPageConfigState(session).phase,
          rootType: pc.rule?.type ?? null,
          nodeCount,
          scriptFunctions: scriptFns,
          scriptDetails: { ...pc.scriptMap },
          scriptVars: scriptVarNames,
          scriptVarDetails: { ...pc.scriptVars },
          styleSelectors,
          styleDetails: { ...pc.styleMap },
        },
        summary: `PageConfig: ${nodeCount} 节点, ${scriptFns.length} 函数, ${scriptVarNames.length} 变量, ${styleSelectors.length} 样式规则`,
      }
    })
  },
}

function countNodes(node: SparkNode): number {
  let count = 1
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child !== 'string' && typeof child !== 'number') count += countNodes(child)
    }
  }
  return count
}

// ═══════════════════════════════════════════════════════════
// Domain 聚合导出
// ═══════════════════════════════════════════════════════════

const allPageConfigStills: StillDefinition[] = [
  pageconfigInit,
  ruleAddComponent,
  ruleSetProps,
  ruleRemoveComponent,
  ruleReorder,
  ruleSetLayout,
  scriptAddHandler,
  scriptAddInitLogic,
  scriptReplaceHandler,
  scriptRemoveHandler,
  scriptSetVar,
  scriptRemoveVar,
  styleAddRule,
  styleRemoveRule,
  styleSetTheme,
  pageconfigValidate,
  pageconfigExport,
  pageconfigDescribe,
] as unknown as StillDefinition[]

export const pageConfigDomain: DomainProvider<PageConfigDomainState> = {
  name: 'pageconfig',
  roleHint: 'SPARK View 页面配置专家——负责组件树、事件脚本、样式的设计与组装',
  stills: allPageConfigStills,
  createState: createPageConfigState,
}
