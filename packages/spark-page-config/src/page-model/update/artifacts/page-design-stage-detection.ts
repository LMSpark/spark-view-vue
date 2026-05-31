/**
 * PageDesign stage detection.
 *
 * PageNode is the source of truth. The 100-step flow is only a production
 * checklist projected from the current PageNode snapshot; four-file editing is
 * the final write surface for rule / pagedata / script / style.
 */

import {
  DataMember,
  isSparkNode,
  parseDataViewKey,
  type DataSetMetadata,
  type DataViewKeyDescriptor,
  type SparkNode,
} from '@spark-view/spark-data'
import { isRecord } from '@spark-view/spark-utils'
import type {
  PageDesignEditHost,
  PageDesignEditPhase,
  PageDesignNodeTree,
} from '../page-edit-session'
import { summarizePageDesignFlowPhases } from './design-flow'

export const PAGE_DESIGN_MIN_SCRIPT_CHARS = 180
export const PAGE_DESIGN_MIN_STYLE_CHARS = 400

export type PageDesignModelPartKey = 'navigation' | 'dataSet' | 'rule' | 'script' | 'style'
export type PageDesignStageStatus = 'blocked' | 'pending' | 'in-progress' | 'ready'

export type PageDesignModelPartDetection = {
  key: PageDesignModelPartKey
  required: boolean
  bound: boolean
  ready: boolean
  summary: string
  issues: readonly string[]
  evidence: readonly string[]
}

export type PageDesignFlowPhaseDetection = {
  phase: string
  firstStep: number
  lastStep: number
  status: PageDesignStageStatus
  sourceParts: readonly PageDesignModelPartKey[]
  missing: readonly string[]
  evidence: readonly string[]
}

export type PageDesignStageDetection = {
  sourceOfTruth: 'PageNode'
  decisionOrder: readonly ['PageNode', '100-step-flow', 'four-file-edit']
  pageNodeParts: Record<PageDesignModelPartKey, PageDesignModelPartDetection>
  phases: readonly PageDesignFlowPhaseDetection[]
  currentPhase: string
  nextPhase: string | null
  finalReady: boolean
  finalIssues: readonly string[]
  nextActions: readonly string[]
  metrics: {
    tableCount: number
    viewCount: number
    relationCount: number
    viewDependencyCount: number
    nodeCount: number
    dataViewBindingCount: number
    handlerReferenceCount: number
    scriptChars: number
    styleChars: number
  }
}

export type PageDesignStageDetectionInput = {
  phase: PageDesignEditPhase
  host: PageDesignEditHost | null
}

type NavigationSnapshot = {
  bound: boolean
  required: boolean
  ready: boolean
  issues: string[]
  evidence: string[]
}

type DataSetSnapshot = {
  bound: boolean
  ready: boolean
  minimalTableReady: boolean
  metadata: DataSetMetadata | null
  tableNames: string[]
  tableFields: Map<string, Set<string>>
  tablePrimaryFields: Map<string, Set<string>>
  viewKeys: Set<string>
  relationCount: number
  viewDependencyCount: number
  relationIssues: string[]
  dependencyIssues: string[]
  issues: string[]
  evidence: string[]
}

type RuleFieldBinding = {
  nodeId: string
  nodeType: string
  field: string
  dataViewKey: string | null
}

type RuleSnapshot = {
  bound: boolean
  ready: boolean
  root: SparkNode | null
  nodeCount: number
  childCount: number
  dataViewKeys: string[]
  handlerNames: string[]
  fieldBindings: RuleFieldBinding[]
  schemaIssues: string[]
  dataViewIssues: string[]
  fieldIssues: string[]
  handlerIssues: string[]
  issues: string[]
  evidence: string[]
}

type TextSnapshot = {
  bound: boolean
  ready: boolean
  content: string
  length: number
  issues: string[]
  evidence: string[]
}

type PageNodeSnapshot = {
  navigation: NavigationSnapshot
  dataSet: DataSetSnapshot
  rule: RuleSnapshot
  script: TextSnapshot
  style: TextSnapshot
}

const REQUIRED_DATA_MEMBER_VALUES: ReadonlySet<string> = new Set(Object.values(DataMember))

export function detectPageDesignStages(input: PageDesignStageDetectionInput): PageDesignStageDetection {
  const snapshot = createPageNodeSnapshot(input)
  const pageNodeParts = createPageNodePartDetections(snapshot)
  const finalIssues = createFinalIssues(snapshot)
  const phases = createPhaseDetections(input.phase, snapshot, finalIssues)
  const nextPhaseDetection = phases.find((phase) => phase.status !== 'ready') ?? null

  return {
    sourceOfTruth: 'PageNode',
    decisionOrder: ['PageNode', '100-step-flow', 'four-file-edit'],
    pageNodeParts,
    phases,
    currentPhase: nextPhaseDetection?.phase ?? '收尾',
    nextPhase: nextPhaseDetection?.phase ?? null,
    finalReady: finalIssues.length === 0,
    finalIssues,
    nextActions: createNextActions(snapshot, finalIssues),
    metrics: {
      tableCount: snapshot.dataSet.tableNames.length,
      viewCount: snapshot.dataSet.viewKeys.size,
      relationCount: snapshot.dataSet.relationCount,
      viewDependencyCount: snapshot.dataSet.viewDependencyCount,
      nodeCount: snapshot.rule.nodeCount,
      dataViewBindingCount: snapshot.rule.dataViewKeys.length,
      handlerReferenceCount: snapshot.rule.handlerNames.length,
      scriptChars: snapshot.script.length,
      styleChars: snapshot.style.length,
    },
  }
}

export function inspectPageDesignFinalIssues(host: PageDesignEditHost): readonly string[] {
  return detectPageDesignStages({ phase: 'editing', host }).finalIssues
}

function createPageNodeSnapshot(input: PageDesignStageDetectionInput): PageNodeSnapshot {
  const navigation = createNavigationSnapshot(input.host)
  const dataSet = createDataSetSnapshot(input.host)
  const rule = createRuleSnapshot(input.host, dataSet)
  const script = createTextSnapshot(input.host, 'script')
  const style = createTextSnapshot(input.host, 'style')
  return { navigation, dataSet, rule, script, style }
}

function createNavigationSnapshot(host: PageDesignEditHost | null): NavigationSnapshot {
  const draft = host?.getNavDraft?.() ?? null
  if (draft === null) {
    return {
      bound: false,
      required: false,
      ready: true,
      issues: [],
      evidence: ['宿主未挂载 navigation 草稿，本轮不强制验收导航属性。'],
    }
  }

  const issues: string[] = []
  if (draft.title.trim().length === 0) issues.push('navigation.title 为空')
  if (draft.nodeKind !== 'sub-page' && draft.path.trim().length === 0) issues.push('navigation.path 为空')

  return {
    bound: true,
    required: true,
    ready: issues.length === 0,
    issues,
    evidence: [
      `navigation.title=${draft.title || '<empty>'}`,
      `navigation.nodeKind=${draft.nodeKind}`,
      draft.nodeKind === 'sub-page' ? 'sub-page 不要求 path' : `navigation.path=${draft.path || '<empty>'}`,
    ],
  }
}

function createDataSetSnapshot(host: PageDesignEditHost | null): DataSetSnapshot {
  const tool = host?.getDataSetTool?.() ?? null
  if (tool === null) {
    return emptyDataSetSnapshot(['pagedata.json 无法读取，缺少 DataSet 工具'])
  }

  const metadata = tool.toJson()
  const tableEntries = Object.entries(metadata.tables)
  const tableNames = tableEntries.map(([tableName]) => tableName)
  const tableFields = new Map<string, Set<string>>()
  const tablePrimaryFields = new Map<string, Set<string>>()
  const viewKeys = new Set<string>()
  const issues: string[] = []
  const evidence: string[] = []

  if (tableEntries.length === 0) {
    issues.push('pagedata.json 还没有业务数据表')
  }

  for (const [tableName, table] of tableEntries) {
    const columns = Array.isArray(table.columns) ? table.columns : []
    const fields = new Set(columns.map((column) => column.name).filter((name) => typeof name === 'string' && name.length > 0))
    const primaryFields = new Set(columns
      .filter((column) => column.isPrimaryKey === true || column.name === 'id')
      .map((column) => column.name)
      .filter((name) => typeof name === 'string' && name.length > 0))
    tableFields.set(tableName, fields)
    tablePrimaryFields.set(tableName, primaryFields)

    if (columns.length === 0) issues.push(`pagedata.json 表 ${tableName} 没有 columns`)
    if (primaryFields.size === 0) issues.push(`pagedata.json 表 ${tableName} 没有主键字段`)

    const views = isRecord(table.views) ? table.views : {}
    const viewIds = Object.keys(views)
    if (viewIds.length === 0) {
      issues.push(`pagedata.json 表 ${tableName} 没有可消费 view`)
    }
    for (const viewId of viewIds) {
      viewKeys.add(`${tableName}@${viewId}`)
    }
  }

  if (tableNames.length > 0) evidence.push(`业务表: ${tableNames.join(', ')}`)
  if (viewKeys.size > 0) evidence.push(`DataView: ${[...viewKeys].join(', ')}`)

  const relationIssues = inspectTableRelations(metadata, tableFields, tablePrimaryFields)
  const dependencyIssues = inspectViewDependencies(metadata, tableFields, viewKeys)
  const allIssues = [...issues, ...relationIssues, ...dependencyIssues]

  return {
    bound: true,
    ready: tableEntries.length > 0 && allIssues.length === 0,
    minimalTableReady: tableEntries.length > 0 && issues.length === 0,
    metadata,
    tableNames,
    tableFields,
    tablePrimaryFields,
    viewKeys,
    relationCount: Array.isArray(metadata.tableRelations) ? metadata.tableRelations.length : 0,
    viewDependencyCount: Array.isArray(metadata.viewDependencies) ? metadata.viewDependencies.length : 0,
    relationIssues,
    dependencyIssues,
    issues: allIssues,
    evidence,
  }
}

function emptyDataSetSnapshot(issues: string[]): DataSetSnapshot {
  return {
    bound: false,
    ready: false,
    minimalTableReady: false,
    metadata: null,
    tableNames: [],
    tableFields: new Map(),
    tablePrimaryFields: new Map(),
    viewKeys: new Set(),
    relationCount: 0,
    viewDependencyCount: 0,
    relationIssues: [],
    dependencyIssues: [],
    issues,
    evidence: [],
  }
}

function inspectTableRelations(
  metadata: DataSetMetadata,
  tableFields: ReadonlyMap<string, ReadonlySet<string>>,
  tablePrimaryFields: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  if (!Array.isArray(metadata.tableRelations)) return []
  const issues: string[] = []

  for (const relation of metadata.tableRelations) {
    const parentTable = normalizeText(relation.parentTable)
    const childTable = normalizeText(relation.childTable)
    if (parentTable.length === 0 || childTable.length === 0) {
      issues.push('tableRelations 存在缺少 parentTable/childTable 的关系')
      continue
    }
    const parentFields = tableFields.get(parentTable)
    const childFields = tableFields.get(childTable)
    if (parentFields === undefined) issues.push(`tableRelations.parentTable 不存在: ${parentTable}`)
    if (childFields === undefined) issues.push(`tableRelations.childTable 不存在: ${childTable}`)
    if (parentFields === undefined || childFields === undefined) continue

    const childField = normalizeText(relation.childField)
    const parentField = normalizeText(relation.parentField)
    if (childField.length === 0 && relation.condition === undefined) {
      issues.push(`tableRelations ${parentTable}->${childTable} 缺少 childField 或 condition`)
    }
    if (childField.length > 0 && !childFields.has(childField)) {
      issues.push(`tableRelations.childField 不存在: ${childTable}.${childField}`)
    }
    if (parentField.length > 0 && !parentFields.has(parentField)) {
      issues.push(`tableRelations.parentField 不存在: ${parentTable}.${parentField}`)
    }
    if (parentField.length === 0 && relation.condition === undefined && (tablePrimaryFields.get(parentTable)?.size ?? 0) === 0) {
      issues.push(`tableRelations ${parentTable}->${childTable} 未声明 parentField，且父表没有主键`)
    }
  }

  return issues
}

function inspectViewDependencies(
  metadata: DataSetMetadata,
  tableFields: ReadonlyMap<string, ReadonlySet<string>>,
  viewKeys: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(metadata.viewDependencies)) return []
  const issues: string[] = []
  const relations = Array.isArray(metadata.tableRelations) ? metadata.tableRelations : []

  for (const dependency of metadata.viewDependencies) {
    const parentTable = normalizeText(dependency.parentTable)
    const childTable = normalizeText(dependency.childTable)
    if (parentTable.length === 0 || childTable.length === 0) {
      issues.push('viewDependencies 存在缺少 parentTable/childTable 的依赖')
      continue
    }
    if (!tableFields.has(parentTable)) issues.push(`viewDependencies.parentTable 不存在: ${parentTable}`)
    if (!tableFields.has(childTable)) issues.push(`viewDependencies.childTable 不存在: ${childTable}`)
    if (!viewKeys.has(`${parentTable}@default`)) issues.push(`viewDependencies 父表 default view 不存在: ${parentTable}@default`)
    if (!viewKeys.has(`${childTable}@default`)) issues.push(`viewDependencies 子表 default view 不存在: ${childTable}@default`)
    if (!relations.some((relation) => relation.parentTable === parentTable && relation.childTable === childTable)) {
      issues.push(`viewDependencies 缺少对应 tableRelations: ${parentTable}->${childTable}`)
    }
  }

  return issues
}

function createRuleSnapshot(host: PageDesignEditHost | null, dataSet: DataSetSnapshot): RuleSnapshot {
  const tree = host?.getNodeTree?.() ?? null
  if (tree === null) {
    return {
      bound: false,
      ready: false,
      root: null,
      nodeCount: 0,
      childCount: 0,
      dataViewKeys: [],
      handlerNames: [],
      fieldBindings: [],
      schemaIssues: [],
      dataViewIssues: [],
      fieldIssues: [],
      handlerIssues: [],
      issues: ['rule.json 无法读取，缺少 NodeTree 工具'],
      evidence: [],
    }
  }

  const root = tree.toJSON()
  const facts = collectRuleFacts(root)
  const dataViewKeys = [...new Set([
    ...collectDataViewKeys(tree),
    ...facts.dataViewKeys,
  ])].sort()
  const handlerNames = [...new Set([
    ...collectHandlerNames(tree),
    ...facts.handlerNames,
  ])].sort()
  const childCount = Array.isArray(root.children) ? root.children.length : 0
  const nodeCount = tree.countNodes()
  const serialized = JSON.stringify(root)
  const issues: string[] = []
  const evidence: string[] = []

  if (childCount === 0 || nodeCount <= 1) issues.push('rule.json 还没有可见业务 UI 结构')
  if (serialized.includes('页面配置就绪') || serialized.includes('请编辑 rule.json')) {
    issues.push('rule.json 仍是初始占位页面')
  }
  if (dataSet.tableNames.length > 0 && dataViewKeys.length === 0) {
    issues.push('rule.json 没有消费 pagedata.json 的 DataView 绑定')
  }

  const dataViewIssues = inspectRuleDataViewKeys(dataViewKeys, dataSet)
  const fieldIssues = inspectRuleFieldBindings(facts.fieldBindings, dataSet)
  if (nodeCount > 0) evidence.push(`rule 节点数: ${String(nodeCount)}`)
  if (dataViewKeys.length > 0) evidence.push(`rule DataView 绑定: ${dataViewKeys.join(', ')}`)
  if (handlerNames.length > 0) evidence.push(`handler 引用: ${handlerNames.join(', ')}`)

  const allIssues = [...issues, ...facts.schemaIssues, ...dataViewIssues, ...fieldIssues]
  return {
    bound: true,
    ready: allIssues.length === 0,
    root,
    nodeCount,
    childCount,
    dataViewKeys,
    handlerNames,
    fieldBindings: facts.fieldBindings,
    schemaIssues: facts.schemaIssues,
    dataViewIssues,
    fieldIssues,
    handlerIssues: [],
    issues: allIssues,
    evidence,
  }
}

function collectDataViewKeys(tree: Pick<PageDesignNodeTree, 'collectDataViewKeys'>): string[] {
  return [...tree.collectDataViewKeys()]
}

function collectHandlerNames(tree: Pick<PageDesignNodeTree, 'collectHandlerNames'>): string[] {
  return [...tree.collectHandlerNames()]
}

function inspectRuleDataViewKeys(dataViewKeys: readonly string[], dataSet: DataSetSnapshot): string[] {
  const issues: string[] = []
  for (const dataViewKey of dataViewKeys) {
    const descriptor = parseDataViewKey(dataViewKey)
    if (descriptor === null) {
      issues.push(`rule.json DataViewKey 无效: ${dataViewKey}`)
      continue
    }
    if (!dataSet.viewKeys.has(toLocalDataViewKey(descriptor))) {
      issues.push(`rule.json DataViewKey 指向不存在的 view: ${dataViewKey}`)
    }
  }
  return issues
}

function inspectRuleFieldBindings(fieldBindings: readonly RuleFieldBinding[], dataSet: DataSetSnapshot): string[] {
  const issues: string[] = []
  for (const binding of fieldBindings) {
    if (binding.dataViewKey === null) continue
    const descriptor = parseDataViewKey(binding.dataViewKey)
    if (descriptor === null) continue
    const tableFields = dataSet.tableFields.get(descriptor.tableName)
    if (tableFields !== undefined && !tableFields.has(binding.field)) {
      issues.push(`rule.json 字段绑定不存在: ${binding.nodeId}<${binding.nodeType}> field=${binding.field} table=${descriptor.tableName}`)
    }
  }
  return issues
}

function collectRuleFacts(root: SparkNode): {
  dataViewKeys: string[]
  handlerNames: string[]
  fieldBindings: RuleFieldBinding[]
  schemaIssues: string[]
  classes: string[]
} {
  const facts: {
    dataViewKeys: string[]
    handlerNames: string[]
    fieldBindings: RuleFieldBinding[]
    schemaIssues: string[]
    classes: string[]
  } = {
    dataViewKeys: [],
    handlerNames: [],
    fieldBindings: [],
    schemaIssues: [],
    classes: [],
  }
  collectRuleFactsRecursive(root, null, facts)
  return facts
}

function collectRuleFactsRecursive(
  node: SparkNode,
  inheritedDataViewKey: string | null,
  facts: {
    dataViewKeys: string[]
    handlerNames: string[]
    fieldBindings: RuleFieldBinding[]
    schemaIssues: string[]
    classes: string[]
  },
): void {
  const props = isRecord(node.props) ? node.props : {}
  const ownDataViewKey = readString(props['dataViewKey'])
  const nodeDataViewKey = ownDataViewKey ?? inheritedDataViewKey
  const optionDataViewKey = readString(props['optionDataViewKey'])
  if (ownDataViewKey !== null) facts.dataViewKeys.push(ownDataViewKey)
  if (optionDataViewKey !== null) facts.dataViewKeys.push(optionDataViewKey)

  const dataMember = readString(props['dataMember'])
  const contextDataMember = readString(props['contextDataMember'])
  if (dataMember !== null && !REQUIRED_DATA_MEMBER_VALUES.has(dataMember)) {
    facts.schemaIssues.push(`rule.json DataMember 无效: ${node.id ?? node.type}.${dataMember}`)
  }
  if (contextDataMember !== null && !REQUIRED_DATA_MEMBER_VALUES.has(contextDataMember)) {
    facts.schemaIssues.push(`rule.json contextDataMember 无效: ${node.id ?? node.type}.${contextDataMember}`)
  }

  const field = readString(props['field'])
  if (field !== null) {
    facts.fieldBindings.push({
      nodeId: node.id ?? '<anonymous>',
      nodeType: node.type,
      field,
      dataViewKey: nodeDataViewKey,
    })
  }

  for (const key of ['class', 'className', 'bodyClass']) {
    const value = readString(props[key])
    if (value !== null) facts.classes.push(value)
  }

  const on = props['on']
  if (isRecord(on)) {
    for (const value of Object.values(on)) {
      const handler = readString(value)
      if (handler !== null) facts.handlerNames.push(handler)
    }
  }

  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    if (isSparkNode(child)) collectRuleFactsRecursive(child, nodeDataViewKey, facts)
  }
}

function createTextSnapshot(host: PageDesignEditHost | null, key: 'script' | 'style'): TextSnapshot {
  const reader = key === 'script' ? host?.readScript : host?.readStyle
  if (reader === undefined) {
    return {
      bound: false,
      ready: false,
      content: '',
      length: 0,
      issues: [key === 'script' ? 'script.js 无法读取，缺少 readScript' : 'style.css 无法读取，缺少 readStyle'],
      evidence: [],
    }
  }

  const content = reader().trim()
  const minChars = key === 'script' ? PAGE_DESIGN_MIN_SCRIPT_CHARS : PAGE_DESIGN_MIN_STYLE_CHARS
  const issues: string[] = []
  if (content.length < minChars) {
    issues.push(key === 'script'
      ? `script.js 还没有形成页面服务脚本，至少需要 ${String(minChars)} 个字符`
      : `style.css 还没有形成页面样式，至少需要 ${String(minChars)} 个字符`)
  }
  if (key === 'script') {
    if (!/\bexport\s+default\b/u.test(content)) issues.push('script.js 缺少 export default 页面服务对象')
    if (content.includes('页面已加载') && !content.includes('export default')) issues.push('script.js 仍接近初始占位脚本')
  }

  return {
    bound: true,
    ready: issues.length === 0,
    content,
    length: content.length,
    issues,
    evidence: [`${key === 'script' ? 'script.js' : 'style.css'} 字符数: ${String(content.length)}`],
  }
}

function createPageNodePartDetections(snapshot: PageNodeSnapshot): Record<PageDesignModelPartKey, PageDesignModelPartDetection> {
  return {
    navigation: {
      key: 'navigation',
      required: snapshot.navigation.required,
      bound: snapshot.navigation.bound,
      ready: snapshot.navigation.ready,
      summary: snapshot.navigation.bound ? 'navigation 草稿已接入 PageNode 基类' : 'navigation 未接入，按未挂载节点处理',
      issues: snapshot.navigation.issues,
      evidence: snapshot.navigation.evidence,
    },
    dataSet: {
      key: 'dataSet',
      required: true,
      bound: snapshot.dataSet.bound,
      ready: snapshot.dataSet.ready,
      summary: snapshot.dataSet.tableNames.length > 0 ? 'pagedata.json 已有业务数据模型' : 'pagedata.json 尚未形成业务数据模型',
      issues: snapshot.dataSet.issues,
      evidence: snapshot.dataSet.evidence,
    },
    rule: {
      key: 'rule',
      required: true,
      bound: snapshot.rule.bound,
      ready: snapshot.rule.ready,
      summary: snapshot.rule.nodeCount > 1 ? 'rule.json 已有业务 UI 结构' : 'rule.json 尚未形成业务 UI 结构',
      issues: snapshot.rule.issues,
      evidence: snapshot.rule.evidence,
    },
    script: {
      key: 'script',
      required: true,
      bound: snapshot.script.bound,
      ready: snapshot.script.ready,
      summary: snapshot.script.ready ? 'script.js 已形成页面服务脚本' : 'script.js 尚未形成页面服务脚本',
      issues: snapshot.script.issues,
      evidence: snapshot.script.evidence,
    },
    style: {
      key: 'style',
      required: true,
      bound: snapshot.style.bound,
      ready: snapshot.style.ready,
      summary: snapshot.style.ready ? 'style.css 已形成页面样式' : 'style.css 尚未形成页面样式',
      issues: snapshot.style.issues,
      evidence: snapshot.style.evidence,
    },
  }
}

function createFinalIssues(snapshot: PageNodeSnapshot): string[] {
  const issues = [
    ...snapshot.navigation.issues,
    ...snapshot.dataSet.issues,
    ...snapshot.rule.issues,
    ...snapshot.script.issues,
    ...snapshot.style.issues,
    ...inspectHandlerReferences(snapshot.rule.handlerNames, snapshot.script.content),
  ]
  return [...new Set(issues)]
}

function inspectHandlerReferences(handlerNames: readonly string[], script: string): string[] {
  return handlerNames
    .filter((handler) => !handler.startsWith('INVALID_'))
    .filter((handler) => !script.includes(handler))
    .map((handler) => `rule.json handler 未在 script.js 中实现: ${handler}`)
}

function createPhaseDetections(
  editPhase: PageDesignEditPhase,
  snapshot: PageNodeSnapshot,
  finalIssues: readonly string[],
): PageDesignFlowPhaseDetection[] {
  return summarizePageDesignFlowPhases().map((phase) => {
    const range = { firstStep: phase.firstStep, lastStep: phase.lastStep }
    switch (phase.phase) {
      case '入口':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['dataSet', 'rule', 'script', 'style'],
          ready: editPhase === 'editing',
          detail: {
            blocked: editPhase !== 'editing',
            missing: editPhase === 'editing' ? [] : ['lifecycle bootstrap 尚未进入 editing'],
            evidence: [`editPhase=${editPhase}`],
          },
        })
      case '盘点':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['navigation', 'dataSet', 'rule', 'script', 'style'],
          ready: snapshot.dataSet.bound && snapshot.rule.bound && snapshot.script.bound && snapshot.style.bound,
          detail: {
            missing: [
              ...(snapshot.dataSet.bound ? [] : ['缺 pagedata.json 读取能力']),
              ...(snapshot.rule.bound ? [] : ['缺 rule.json 读取能力']),
              ...(snapshot.script.bound ? [] : ['缺 script.js 读取能力']),
              ...(snapshot.style.bound ? [] : ['缺 style.css 读取能力']),
            ],
            evidence: ['PageNode 快照已读取并用于阶段判断'],
          },
        })
      case '数据规划':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['dataSet'],
          ready: snapshot.dataSet.tableNames.length > 0,
          detail: {
            missing: snapshot.dataSet.tableNames.length > 0 ? [] : ['还没有从用户需求沉淀业务对象和表名'],
            evidence: snapshot.dataSet.evidence,
          },
        })
      case '最小表模型':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['dataSet'],
          ready: snapshot.dataSet.minimalTableReady,
          detail: {
            missing: snapshot.dataSet.minimalTableReady ? [] : snapshot.dataSet.issues,
            evidence: snapshot.dataSet.evidence,
          },
        })
      case '表关系':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['dataSet'],
          ready: snapshot.dataSet.relationIssues.length === 0,
          detail: {
            missing: snapshot.dataSet.relationIssues,
            evidence: snapshot.dataSet.relationCount > 0 ? [`tableRelations=${String(snapshot.dataSet.relationCount)}`] : ['没有 UI/业务消费场景时不强制 tableRelations'],
          },
        })
      case '页面规划':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['rule'],
          ready: snapshot.rule.childCount > 0 && snapshot.rule.nodeCount > 1,
          detail: {
            missing: snapshot.rule.childCount > 0 && snapshot.rule.nodeCount > 1 ? [] : ['尚未形成页面区域和主工作区'],
            evidence: snapshot.rule.evidence,
          },
        })
      case '数据利用':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['dataSet', 'rule'],
          ready: snapshot.dataSet.tableNames.length === 0 || snapshot.rule.dataViewKeys.length > 0,
          detail: {
            missing: snapshot.dataSet.tableNames.length > 0 && snapshot.rule.dataViewKeys.length === 0 ? ['已有业务表，但 UI 还没有 DataView 消费点'] : [],
            evidence: snapshot.rule.dataViewKeys.length > 0 ? [`DataView 消费点: ${snapshot.rule.dataViewKeys.join(', ')}`] : ['无业务表时不强制 DataView 消费点'],
          },
        })
      case '按需视图':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['dataSet', 'rule'],
          ready: snapshot.rule.dataViewIssues.length === 0,
          detail: {
            missing: snapshot.rule.dataViewIssues,
            evidence: snapshot.rule.dataViewKeys.length > 0 ? ['rule DataViewKey 均能解析到 pagedata views'] : ['尚无独立 DataView 消费点'],
          },
        })
      case '视图依赖':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['dataSet'],
          ready: snapshot.dataSet.dependencyIssues.length === 0,
          detail: {
            missing: snapshot.dataSet.dependencyIssues,
            evidence: snapshot.dataSet.viewDependencyCount > 0 ? [`viewDependencies=${String(snapshot.dataSet.viewDependencyCount)}`] : ['输入界面/主从联动未明确时不强制 viewDependencies'],
          },
        })
      case '结构':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['rule'],
          ready: snapshot.rule.issues.length === 0,
          detail: {
            missing: snapshot.rule.issues,
            evidence: snapshot.rule.evidence,
          },
        })
      case '行为':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['script', 'rule'],
          ready: snapshot.script.ready && inspectHandlerReferences(snapshot.rule.handlerNames, snapshot.script.content).length === 0,
          detail: {
            missing: [...snapshot.script.issues, ...inspectHandlerReferences(snapshot.rule.handlerNames, snapshot.script.content)],
            evidence: snapshot.script.evidence,
          },
        })
      case '样式':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['style'],
          ready: snapshot.style.ready,
          detail: {
            missing: snapshot.style.issues,
            evidence: snapshot.style.evidence,
          },
        })
      case '交叉校验':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['dataSet', 'rule', 'script', 'style'],
          ready: finalIssues.length === 0,
          detail: {
            missing: finalIssues,
            evidence: ['跨 navigation/rule/dataSet/script/style 执行静态闭环校验'],
          },
        })
      case '预览修正':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['rule', 'dataSet', 'script', 'style'],
          ready: finalIssues.length === 0,
          detail: {
            missing: finalIssues.length === 0 ? [] : ['静态门禁未过，暂不进入预览修正'],
            evidence: finalIssues.length === 0 ? ['静态门禁已过，外层 SSE/浏览器评估继续负责预览验证'] : [],
          },
        })
      case '收尾':
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: ['navigation', 'dataSet', 'rule', 'script', 'style'],
          ready: finalIssues.length === 0,
          detail: {
            missing: finalIssues,
            evidence: finalIssues.length === 0 ? ['PageNode 最终门禁已通过'] : [],
          },
        })
      default:
        return phaseDetection({
          phase: phase.phase,
          range,
          sourceParts: [],
          ready: true,
          detail: { evidence: [] },
        })
    }
  })
}

type PhaseDetectionCommand = Readonly<{
  phase: string
  range: { firstStep: number; lastStep: number }
  sourceParts: readonly PageDesignModelPartKey[]
  ready: boolean
  detail: { blocked?: boolean; missing?: readonly string[]; evidence?: readonly string[] }
}>

function phaseDetection(command: PhaseDetectionCommand): PageDesignFlowPhaseDetection {
  const { phase, range, sourceParts, ready, detail } = command
  const missing = [...new Set(detail.missing ?? [])]
  const evidence = [...new Set(detail.evidence ?? [])]
  const status: PageDesignStageStatus = detail.blocked === true
    ? 'blocked'
    : ready
      ? 'ready'
      : evidence.length > 0
        ? 'in-progress'
        : 'pending'
  return {
    phase,
    firstStep: range.firstStep,
    lastStep: range.lastStep,
    status,
    sourceParts,
    missing,
    evidence,
  }
}

function createNextActions(snapshot: PageNodeSnapshot, finalIssues: readonly string[]): string[] {
  if (finalIssues.length === 0) return ['agent_complete({ summary }) 申请收尾']
  if (!snapshot.dataSet.ready) {
    return ['优先调用 standard-page.buildManagementWorkbench，或用 dataset 函数沉淀业务表/字段/view']
  }
  if (!snapshot.rule.ready) {
    return ['按 UI 消费点调用 standard-page.buildManagementWorkbench 或 node-tree.addNodes / setProps 补 rule.json']
  }
  if (!snapshot.script.ready) {
    return ['调用 text-model.writeScript 补页面服务脚本，确保 export default 和必要 handler']
  }
  if (!snapshot.style.ready) {
    return ['调用 text-model.writeStyle 补页面布局与组件样式']
  }
  return ['根据 finalIssues 精确修复 PageNode 缺口后再 agent_complete']
}

function toLocalDataViewKey(descriptor: DataViewKeyDescriptor): string {
  return `${descriptor.tableName}@${descriptor.viewId}`
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
