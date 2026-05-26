/**
 * Module-semantic knowledge projection — type definitions.
 */

import type { LlmJsonSchemaObject, LlmJsonValue } from '../../schema'
import type {
  ModuleFunctionFailureMode,
  ModuleFunctionMetadata,
  ModuleFunctionResultSchema,
  ModuleKind,
  ModuleParameterPayloadMetadata,
} from '../protocol'

export type ModuleSemanticKnowledgeAttributeAccessMode = 'read' | 'write' | 'read-write' | 'none'

export type ModuleSemanticKnowledgeAttributeGuide = Readonly<{
  name: string
  description: string
  access: ModuleSemanticKnowledgeAttributeAccessMode
  readable: boolean
  writable: boolean
  schemaLookupStep: string
  readStep?: string
  writeStep?: string
}>

export type ModuleSemanticKnowledgeLayerFunction = Readonly<{
  toolName: string
  kindPath: readonly string[]
  functionName: string
  description: string
  paramNames: readonly string[]
  requiredParamNames: readonly string[]
  lookupSteps: readonly string[]
  invokeStep: string
  payloadRefs: readonly string[]
}>

export type ModuleSemanticKnowledgeChildAttributeSummary = Readonly<{
  name: string
  description: string
  access: ModuleSemanticKnowledgeAttributeAccessMode
}>

export type ModuleSemanticKnowledgeChildFunctionSummary = Readonly<{
  functionName: string
  description: string
  requiredParamNames: readonly string[]
  payloadRefs: readonly string[]
}>

export type ModuleSemanticKnowledgeChildKindSummary = Readonly<{
  kind: string
  name: string
  description: string
  functionNames: readonly string[]
  attributeNames: readonly string[]
  payloadRefs: readonly string[]
  childKindNames: readonly string[]
  attributeSummaries: readonly ModuleSemanticKnowledgeChildAttributeSummary[]
  functionSummaries: readonly ModuleSemanticKnowledgeChildFunctionSummary[]
  detailLookupSteps: readonly string[]
}>

export type ModuleSemanticKnowledgeInstanceGuide = Readonly<{
  refShape: string
  pathPattern: string
  discoveryScope: 'root' | 'parent'
  queryFields: readonly string[]
  queryExamples: ReadonlyArray<Readonly<Record<string, LlmJsonValue>>>
  discoverySteps: readonly string[]
  pathBuildSteps: readonly string[]
  operationSteps: readonly string[]
}>

export type ModuleSemanticKnowledgeKindLayer = Readonly<{
  kind: string
  name: string
  description: string
  parentKind?: string
  level: number
  pathPattern: string
  instanceGuide: ModuleSemanticKnowledgeInstanceGuide
  instanceLookupSteps: readonly string[]
  childLookupSteps: readonly string[]
  attributeLookupSteps: readonly string[]
  functionLookupSteps: readonly string[]
  payloadLookupSteps: readonly string[]
  attributes: readonly ModuleSemanticKnowledgeAttributeGuide[]
  functions: readonly ModuleSemanticKnowledgeLayerFunction[]
  childKinds: readonly ModuleSemanticKnowledgeChildKindSummary[]
}>

export type ModuleSemanticKnowledgeModuleSummary = Readonly<{
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
  instanceGuide: ModuleSemanticKnowledgeInstanceGuide
  instanceLookupSteps: readonly string[]
  childLookupSteps: readonly string[]
  attributeLookupSteps: readonly string[]
  functionLookupSteps: readonly string[]
  attributeGuides: readonly ModuleSemanticKnowledgeAttributeGuide[]
  functionGuides: readonly ModuleSemanticKnowledgeLayerFunction[]
  childKindSummaries: readonly ModuleSemanticKnowledgeChildKindSummary[]
}>

export type ModuleSemanticKnowledgeModuleFilter = Readonly<{
  kind?: string
  parentKind?: string
  keyword?: string
}>

export type ModuleSemanticKnowledgeFunctionSummary = Readonly<{
  toolName: string
  kindPath: readonly string[]
  kind: string
  functionName: string
  description: string
  paramNames: readonly string[]
  requiredParamNames: readonly string[]
  failureCodes: readonly string[]
  usageRuleCount: number
  failureModeCount: number
  functionLookupSteps: readonly string[]
  payloadRefs: readonly string[]
  requiresPayloadGuide: boolean
  payloadLookupSteps: readonly string[]
}>

export type ModuleSemanticKnowledgeFunctionGuide = Readonly<{
  toolName: string
  kindPath: readonly string[]
  kind: string
  functionName: string
  description: string
  paramsSchema: LlmJsonSchemaObject
  resultSchema?: ModuleFunctionResultSchema
  usageRules: readonly string[]
  failureModes: readonly ModuleFunctionFailureMode[]
  functionLookupSteps: readonly string[]
  payloadRefs: readonly string[]
  requiresPayloadGuide: boolean
  payloadLookupSteps: readonly string[]
  example?: LlmJsonValue
}>

export type ModuleSemanticKnowledgeSnapshot = Readonly<{
  modules: readonly ModuleSemanticKnowledgeModuleSummary[]
  functions: readonly ModuleSemanticKnowledgeFunctionSummary[]
  kindLayers: readonly ModuleSemanticKnowledgeKindLayer[]
  promptSnapshot: string
}>

export type ModuleSemanticKnowledgeFunctionFilter = Readonly<{
  kind?: string
  keyword?: string
}>

export type ModuleSemanticKnowledgeFunctionGuideInput = Readonly<{
  toolName?: string
  kind?: string
  functionName?: string
}>

export type ModuleSemanticHumanQuestionGuideInput = Readonly<{
  context: string
  reason: string
  missingFacts?: readonly string[]
  candidateOptions?: readonly string[]
}>

export type ModuleSemanticHumanQuestionGuide = Readonly<{
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
  kindPathFromTool?: readonly string[]
}>

export type PayloadCatalogDescriptor = Readonly<{
  kind: string
  kindPath: readonly string[]
  parentKind?: string
}>

export type FunctionKnowledgeProjectionOptions = Readonly<{
  kind: string
  kindPath: readonly string[]
  fn: ModuleFunctionMetadata
  payloads: readonly ModuleParameterPayloadMetadata[]
  payloadCatalogs: readonly PayloadCatalogDescriptor[]
}>

export type KindLayerOptions = Readonly<{
  moduleKind: ModuleKind
  allKinds: readonly ModuleKind[]
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
