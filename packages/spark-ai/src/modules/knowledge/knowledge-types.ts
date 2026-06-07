/**
 * ═══════════════════════════════════════════════════════════════
 * modules/knowledge/knowledge-types.ts — 知识投影类型定义
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】modules 知识投影层的 SSOT 类型契约。定义从
 *   AiModule 注册表到 LLM 可读知识结构的全部投影类型。
 *   所有类型均为只读（Readonly），确保知识快照是不可变数据。
 *
 * 【类型分组】
 *   属性投影：    AiModuleKnowledgeAttributeGuide / ChildAttributeSummary
 *   函数投影：    AiModuleKnowledgeLayerFunction / FunctionSummary / FunctionGuide
 *   实例导航：    AiModuleKnowledgeInstanceGuide
 *   模块层次：    AiModuleKnowledgeKindLayer / ModuleSummary / ChildKindSummary
 *   快照：        AiModuleKnowledgeSnapshot
 *   查询/过滤：   ModuleFilter / FunctionFilter / FunctionGuideInput
 *   人工提问：    HumanQuestionGuide / HumanQuestionGuideInput
 *   内部选项：    KindLayerOptions / FunctionKnowledgeProjectionOptions 等
 *
 * 【消费方】ai-module-knowledge.ts（投影器）、knowledge-support.ts（辅助函数）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonSchema, AiJsonSchemaObject, AiJsonValue } from '../../json'
import type {
  AiModuleFunctionAntiExample,
  AiModuleFunctionExample,
  AiModuleFunctionFailureMode,
  AiModuleFunctionMetadata,
  AiModuleFunctionResultApiMetadata,
  AiModuleFunctionResultSchema,
  AiModule,
} from '../protocol'
import type { AiModulePayloadMetadata } from '../protocol/module-metadata'

export type AiModuleKnowledgeAttributeAccessMode = 'read' | 'write' | 'read-write' | 'none'
export type AiModuleKnowledgeLevel = 'directory' | 'overview' | 'detail'

export type AiModuleKnowledgeAttributeGuide = Readonly<{
  knowledgeLevel: 'directory'
  name: string
  description: string
  access: AiModuleKnowledgeAttributeAccessMode
  readable: boolean
  writable: boolean
  detailToolName: 'module_attribute_guide'
  detailLookupStep: string
  readStep?: string
  writeStep?: string
}>

export type AiModuleKnowledgeLayerFunction = Readonly<{
  knowledgeLevel: 'directory'
  toolName: string
  kindPath: readonly string[]
  functionName: string
  description: string
  detailToolName: 'module_function_guide'
  detailLookupStep: string
  lookupSteps: readonly string[]
  invokeStep: string
  payloadRefs: readonly string[]
  requiresPayloadGuide: boolean
}>

export type AiModuleKnowledgeChildAttributeSummary = Readonly<{
  knowledgeLevel: 'directory'
  name: string
  description: string
  access: AiModuleKnowledgeAttributeAccessMode
  detailLookupStep: string
}>

export type AiModuleKnowledgeChildFunctionSummary = Readonly<{
  knowledgeLevel: 'directory'
  functionName: string
  description: string
  payloadRefs: readonly string[]
  detailLookupStep: string
}>

export type AiModuleKnowledgeChildKindSummary = Readonly<{
  kind: string
  name: string
  description: string
  functionNames: readonly string[]
  attributeNames: readonly string[]
  payloadRefs: readonly string[]
  childKindNames: readonly string[]
  attributeSummaries: readonly AiModuleKnowledgeChildAttributeSummary[]
  functionSummaries: readonly AiModuleKnowledgeChildFunctionSummary[]
  detailLookupSteps: readonly string[]
}>

export type AiModuleKnowledgeKindGuideAttribute = Readonly<{
  knowledgeLevel: 'directory'
  name: string
  description: string
  access: AiModuleKnowledgeAttributeAccessMode
  readable: boolean
  writable: boolean
  detailToolName: 'module_attribute_guide'
  detailLookupStep: string
}>

export type AiModuleKnowledgeKindGuideFunction = Readonly<{
  knowledgeLevel: 'directory'
  name: string
  functionName: string
  description: string
  detailLookupStep: string
}>

export type AiModuleKnowledgeKindGuidePayload = Readonly<{
  payloadRef: string
  description: string
  requiredForFunctions: readonly string[]
}>

export type AiModuleKnowledgeKindGuideChild = Readonly<{
  kind: string
  name: string
  description: string
}>

export type AiModuleKnowledgeKindGuide = Readonly<{
  knowledgeLevel: 'overview'
  kind: string
  name: string
  description: string
  registeredPrompt: string
  parentKind?: string
  pathPattern: string
  directoryFirstRule: string
  howToUse: readonly string[]
  nextSteps: readonly string[]
  attributes: readonly AiModuleKnowledgeKindGuideAttribute[]
  functions: readonly AiModuleKnowledgeKindGuideFunction[]
  payloads: readonly AiModuleKnowledgeKindGuidePayload[]
  children: readonly string[]
  childKinds: readonly AiModuleKnowledgeKindGuideChild[]
}>

export type AiModuleKnowledgeInstanceGuide = Readonly<{
  refShape: string
  pathPattern: string
  discoveryScope: 'root' | 'parent'
  queryFields: readonly string[]
  queryExamples: ReadonlyArray<Readonly<Record<string, AiJsonValue>>>
  discoverySteps: readonly string[]
  pathBuildSteps: readonly string[]
  operationSteps: readonly string[]
}>

export type AiModuleKnowledgeKindLayer = Readonly<{
  kind: string
  name: string
  description: string
  parentKind?: string
  level: number
  pathPattern: string
  instanceGuide: AiModuleKnowledgeInstanceGuide
  instanceLookupSteps: readonly string[]
  childLookupSteps: readonly string[]
  attributeLookupSteps: readonly string[]
  functionLookupSteps: readonly string[]
  payloadLookupSteps: readonly string[]
  attributes: readonly AiModuleKnowledgeAttributeGuide[]
  functions: readonly AiModuleKnowledgeLayerFunction[]
  childKinds: readonly AiModuleKnowledgeChildKindSummary[]
}>

export type AiModuleKnowledgeModuleSummary = Readonly<{
  kind: string
  name: string
  description: string
  parentKind?: string
  attributeCount: number
  attributeNames: readonly string[]
  readableAttributeNames: readonly string[]
  writableAttributeNames: readonly string[]
  functionCount: number
  functionNames: readonly string[]
  payloadCount: number
  payloadRefs: readonly string[]
  payloadFunctionRefs: readonly string[]
  payloadLookupSteps: readonly string[]
  childKindCount: number
  children: readonly string[]
  level: number
  pathPattern: string
  instanceGuide: AiModuleKnowledgeInstanceGuide
  instanceLookupSteps: readonly string[]
  childLookupSteps: readonly string[]
  attributeLookupSteps: readonly string[]
  functionLookupSteps: readonly string[]
  attributeGuides: readonly AiModuleKnowledgeAttributeGuide[]
  functionGuides: readonly AiModuleKnowledgeLayerFunction[]
  childKindSummaries: readonly AiModuleKnowledgeChildKindSummary[]
}>

export type AiModuleKnowledgeModuleFilter = Readonly<{
  kind?: string
  parentKind?: string
  keyword?: string
}>

export type AiModuleKnowledgeFunctionSummary = Readonly<{
  knowledgeLevel: 'directory'
  toolName: string
  kindPath: readonly string[]
  kind: string
  functionName: string
  description: string
  detailToolName: 'module_function_guide'
  detailLookupStep: string
  hasParams: boolean
  hasUsageRules: boolean
  hasFailureModes: boolean
  resultApiKinds: readonly string[]
  usageRuleCount: number
  failureModeCount: number
  functionLookupSteps: readonly string[]
  payloadRefs: readonly string[]
  requiresPayloadGuide: boolean
  payloadLookupSteps: readonly string[]
}>

export type AiModuleKnowledgeFunctionGuide = Readonly<{
  knowledgeLevel: 'detail'
  toolName: string
  kindPath: readonly string[]
  kind: string
  functionName: string
  description: string
  directoryLookupStep: string
  callPattern: Readonly<{
    toolName: string
    path: string
    args: string
  }>
  scriptPattern: Readonly<{
    receiver: string
    call: string
    args: string
  }>
  programmingFlow: readonly string[]
  paramNames: readonly string[]
  requiredParamNames: readonly string[]
  paramsSchema: AiJsonSchemaObject
  resultSchema?: AiModuleFunctionResultSchema
  resultApis: readonly AiModuleFunctionResultApiMetadata[]
  usageRules: readonly string[]
  requiredBeforeCall: readonly string[]
  failureModes: readonly AiModuleFunctionFailureMode[]
  recoveryHints: readonly string[]
  functionLookupSteps: readonly string[]
  payloadRefs: readonly string[]
  requiresPayloadGuide: boolean
  payloadLookupSteps: readonly string[]
  examples: readonly AiModuleFunctionExample[]
  antiExamples: readonly AiModuleFunctionAntiExample[]
}>

export type AiModuleKnowledgeSnapshot = Readonly<{
  modules: readonly AiModuleKnowledgeModuleSummary[]
  functions: readonly AiModuleKnowledgeFunctionSummary[]
  kindLayers: readonly AiModuleKnowledgeKindLayer[]
  promptSnapshot: string
}>

export type AiModuleKnowledgeFunctionFilter = Readonly<{
  kind?: string
  keyword?: string
}>

export type AiModuleKnowledgeFunctionGuideInput = Readonly<{
  kind?: string
  functionName?: string
}>

export type AiModuleKnowledgeAttributeGuideInput = Readonly<{
  kind?: string
  attrName?: string
  property?: string
}>

export type AiModuleKnowledgeAttributeDetailGuide = Readonly<{
  knowledgeLevel: 'detail'
  kind: string
  attrName: string
  property?: string
  name: string
  description: string
  access: AiModuleKnowledgeAttributeAccessMode
  readable: boolean
  writable: boolean
  directoryLookupStep: string
  schema: AiJsonSchema
  childProperties: readonly string[]
  propertyLookupSteps: readonly string[]
  readStep?: string
  writeStep?: string
  example?: AiJsonValue
}>

export type AiModuleHumanQuestionGuideInput = Readonly<{
  context: string
  reason: string
  missingFacts?: readonly string[]
  candidateOptions?: readonly string[]
}>

export type AiModuleHumanQuestionGuide = Readonly<{
  kind: string
  shouldAskHuman: boolean
  stopToolCalls: boolean
  context: string
  reason: string
  missingFacts: readonly string[]
  candidateOptions: readonly string[]
  question: string
  usageRules: readonly string[]
  resumeFlow: readonly string[]
}>

// ── 内部类型 ──────────────────────────────────────────────────

export type ParsedKnowledgeFunction = Readonly<{
  kind: string
  functionName: string
}>

export type PayloadCatalogDescriptor = Readonly<{
  kind: string
  kindPath: readonly string[]
  parentKind?: string
}>

export type FunctionKnowledgeProjectionOptions = Readonly<{
  kind: string
  kindPath: readonly string[]
  fn: AiModuleFunctionMetadata
  payloads: readonly AiModulePayloadMetadata[]
  payloadCatalogs: readonly PayloadCatalogDescriptor[]
}>

export type KindLayerOptions = Readonly<{
  moduleKind: AiModule
  allKinds: readonly AiModule[]
  payloadCatalogs: readonly PayloadCatalogDescriptor[]
}>

export type FunctionLookupStepsOptions = Readonly<{
  kind: string
  kindPath: readonly string[]
  functionName?: string
}>

export type PayloadLookupStepsOptions = Readonly<{
  kind: string
  kindPath: readonly string[]
  functionName?: string
  payloadRefs: readonly string[]
  payloadCatalogs: readonly PayloadCatalogDescriptor[]
}>
