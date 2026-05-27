/**
 * AiModule knowledge projection — type definitions.
 */

import type { AiJsonSchemaObject, AiJsonValue } from '../../json'
import type {
  AiModuleFunctionFailureMode,
  AiModuleFunctionMetadata,
  AiModuleFunctionResultSchema,
  AiModule,
  AiModulePayloadMetadata,
} from '../protocol'

export type AiModuleKnowledgeAttributeAccessMode = 'read' | 'write' | 'read-write' | 'none'

export type AiModuleKnowledgeAttributeGuide = Readonly<{
  name: string
  description: string
  access: AiModuleKnowledgeAttributeAccessMode
  readable: boolean
  writable: boolean
  schemaLookupStep: string
  readStep?: string
  writeStep?: string
}>

export type AiModuleKnowledgeLayerFunction = Readonly<{
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

export type AiModuleKnowledgeChildAttributeSummary = Readonly<{
  name: string
  description: string
  access: AiModuleKnowledgeAttributeAccessMode
}>

export type AiModuleKnowledgeChildFunctionSummary = Readonly<{
  functionName: string
  description: string
  requiredParamNames: readonly string[]
  payloadRefs: readonly string[]
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

export type AiModuleKnowledgeFunctionGuide = Readonly<{
  toolName: string
  kindPath: readonly string[]
  kind: string
  functionName: string
  description: string
  paramNames: readonly string[]
  requiredParamNames: readonly string[]
  paramsSchema: AiJsonSchemaObject
  resultSchema?: AiModuleFunctionResultSchema
  usageRules: readonly string[]
  failureModes: readonly AiModuleFunctionFailureMode[]
  functionLookupSteps: readonly string[]
  payloadRefs: readonly string[]
  requiresPayloadGuide: boolean
  payloadLookupSteps: readonly string[]
  example?: AiJsonValue
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
