/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-runtime
 * 职责：把 Agent Workflow Definition 的 runtimeBinding 声明与 app 注入能力解释成可注册的 Agent registration。
 * 边界：不导入 app 层模型、编辑器或 UI；只通过泛型 binding 接口组合 ClassModel runtime。
 * AI用途：需要从设计器发布 definition 激活 AI host 时，用本模块确认解释器接线。
 */

import type { ClassModelKnowledgeProvider } from '../../class-model'
import type { AiJsonParams } from '../../json'
import { ClassModelAgentAdapter } from '../business/class-model-agent-adapter'
import type { AiAgentHost } from '../business/ai-host'
import { createSimpleInputContract } from '../business/business-kit'
import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
} from '../business/lifecycle-types'
import type { AiAgentRegistration, AiAgentToolLoopNudgeContext } from '../business/registration-types'
import type { AiAgentRuntimeContext } from '../business/scope-types'
import type {
  AgentWorkflowBusinessNode,
  AgentWorkflowDefinition,
  AgentWorkflowNodeConditionalHint,
  AgentWorkflowNodeGateRule,
  AgentWorkflowNodeKnowledge,
  AgentWorkflowNodeModuleClassRef,
  AgentWorkflowNodeRuntimeBinding,
} from './agent-workflow-definition'
import { assertAgentWorkflowDefinition } from './agent-workflow-validation'

export type AgentWorkflowModuleConstructor<TInstance> = new (...args: never[]) => TInstance

export type AgentWorkflowRuntimeKnowledge = Readonly<{
  provider: ClassModelKnowledgeProvider
  dtsClassModelManifestUrl: string
}>

export type AgentWorkflowRuntimeGateResult = Readonly<{
  ok: boolean
  reason?: string
  fix?: string
}>

export type AgentWorkflowRuntimeGateCommand = Readonly<{
  editorSource: string
  rules: readonly AgentWorkflowNodeGateRule[]
  options: AiAgentBeforeFunctionCallOptions
}>

export type AgentWorkflowRuntimeSystemPromptCommand = Readonly<{
  editorSource: string
  template: string
  hints: readonly AgentWorkflowNodeConditionalHint[]
  input: AiJsonParams
}>

export type AgentWorkflowRuntimeBindings<TInstance> = Readonly<{
  moduleClassResolver: (ref: AgentWorkflowNodeModuleClassRef) => AgentWorkflowModuleConstructor<TInstance>
  editorGetterRegistry: Readonly<Record<string, (context: AiAgentRuntimeContext) => TInstance>>
  knowledgeProviderFactory: (config: AgentWorkflowNodeKnowledge) => AgentWorkflowRuntimeKnowledge
  gateExecutor?: (command: AgentWorkflowRuntimeGateCommand) => AgentWorkflowRuntimeGateResult
  systemPromptInterpolator: (command: AgentWorkflowRuntimeSystemPromptCommand) => string
}>

export type InterpretAgentWorkflowDefinitionCommand<TInstance> = Readonly<{
  definition: AgentWorkflowDefinition
  bindings: AgentWorkflowRuntimeBindings<TInstance>
}>

export type ActivateAgentWorkflowFromDefinitionCommand<TInstance> =
  InterpretAgentWorkflowDefinitionCommand<TInstance> & Readonly<{
  host: AiAgentHost
}>

export type AgentWorkflowInterpretedRegistration = Readonly<{
  workflowId: string
  alias: string
  moduleId: string
  rootClassName: string
  registration: AiAgentRegistration
}>

export function interpretAgentWorkflowDefinition<TInstance>(
  command: InterpretAgentWorkflowDefinitionCommand<TInstance>,
): AgentWorkflowInterpretedRegistration {
  assertAgentWorkflowDefinition(command.definition)
  const node = findSingleBusinessNode(command.definition)
  const runtimeBinding = node.data.runtimeBinding
  if (runtimeBinding === undefined) {
    throw new Error(`Agent workflow runtime requires runtimeBinding on business node "${node.id}".`)
  }
  const moduleClass = command.bindings.moduleClassResolver(runtimeBinding.moduleClassRef)
  const editorGetter = resolveEditorGetter(command.bindings, runtimeBinding)
  const knowledge = command.bindings.knowledgeProviderFactory(runtimeBinding.knowledge)
  const dtsClassModelManifestUrl = normalizeRequiredText(
    knowledge.dtsClassModelManifestUrl,
    'knowledge.dtsClassModelManifestUrl',
  )
  const rootClassName = normalizeRequiredText(runtimeBinding.knowledge.rootClassName, 'knowledge.rootClassName')
  const beforeFunctionCall = createBeforeFunctionCall({
    runtimeBinding,
    bindings: command.bindings,
  })

  const registration = ClassModelAgentAdapter.createRegistration<TInstance>({
    moduleClass,
    options: {
      moduleId: runtimeBinding.registration.moduleId,
      rootClassName,
      dtsClassModelManifestUrl,
      knowledge: knowledge.provider,
      inputContract: createSimpleInputContract({
        businessId: runtimeBinding.registration.businessId,
        identityField: runtimeBinding.inputContract.identityField,
        messageField: runtimeBinding.inputContract.messageField,
        paramsSchema: runtimeBinding.inputContract.paramsSchema,
        systemPrompt: input => command.bindings.systemPromptInterpolator({
          editorSource: runtimeBinding.resolveInstance.editorSource,
          template: runtimeBinding.systemPrompt.template,
          hints: runtimeBinding.systemPrompt.conditionalHints ?? [],
          input,
        }),
        ...(runtimeBinding.inputContract.readonlySteps === undefined
          ? {}
          : { readonlySteps: runtimeBinding.inputContract.readonlySteps }),
      }),
      resolveInstance: context => editorGetter(context),
      ...(beforeFunctionCall === undefined ? {} : { beforeFunctionCall }),
      ...(runtimeBinding.agentCompleteMethodName === undefined
        ? {}
        : { agentCompleteMethodName: runtimeBinding.agentCompleteMethodName }),
      ...(runtimeBinding.executionToolNames === undefined
        ? {}
        : { executionToolNames: new Set(runtimeBinding.executionToolNames) }),
      ...(runtimeBinding.planWithoutToolMarkers === undefined
        ? {}
        : { planWithoutToolMarkers: runtimeBinding.planWithoutToolMarkers }),
      ...(runtimeBinding.toolLoopNudge === undefined
        ? {}
        : { toolLoopNudge: createToolLoopNudge(runtimeBinding) }),
    },
  })

  return {
    workflowId: command.definition.workflowId,
    alias: runtimeBinding.registration.alias,
    moduleId: runtimeBinding.registration.moduleId,
    rootClassName,
    registration,
  }
}

export function activateAgentWorkflowFromDefinition<TInstance>(
  command: ActivateAgentWorkflowFromDefinitionCommand<TInstance>,
): AiAgentHost {
  const interpreted = interpretAgentWorkflowDefinition(command)
  return command.host.ensure(interpreted.alias, {
    moduleId: interpreted.moduleId,
    create: () => interpreted.registration,
  })
}

function findSingleBusinessNode(definition: AgentWorkflowDefinition): AgentWorkflowBusinessNode {
  const nodes = definition.workflow.graph.nodes.filter((node): node is AgentWorkflowBusinessNode => node.type === 'node')
  if (nodes.length !== 1) {
    throw new Error(`Agent workflow runtime expects exactly one business node, got ${nodes.length}.`)
  }
  const node = nodes[0]
  if (node === undefined) {
    throw new Error('Agent workflow runtime business node is missing.')
  }
  return node
}

function resolveEditorGetter<TInstance>(
  bindings: AgentWorkflowRuntimeBindings<TInstance>,
  runtimeBinding: AgentWorkflowNodeRuntimeBinding,
): (context: AiAgentRuntimeContext) => TInstance {
  const editorSource = runtimeBinding.resolveInstance.editorSource
  const getter = bindings.editorGetterRegistry[editorSource]
  if (getter === undefined) {
    throw new Error(`Agent workflow editor getter not found: ${editorSource}`)
  }
  return getter
}

function createBeforeFunctionCall<TInstance>(
  command: Readonly<{
    runtimeBinding: AgentWorkflowNodeRuntimeBinding
    bindings: AgentWorkflowRuntimeBindings<TInstance>
  }>,
): ((instance: TInstance, options: AiAgentBeforeFunctionCallOptions) => AiAgentBeforeFunctionCallDirective) | undefined {
  const beforeFunctionCall = command.runtimeBinding.beforeFunctionCall
  if (beforeFunctionCall === undefined) return undefined
  const gateExecutor = command.bindings.gateExecutor
  if (gateExecutor === undefined) {
    throw new Error('Agent workflow beforeFunctionCall requires gateExecutor binding.')
  }
  return (_instance, options) => {
    const gate = gateExecutor({
      editorSource: command.runtimeBinding.resolveInstance.editorSource,
      rules: beforeFunctionCall.gateRules,
      options,
    })
    if (gate.ok) return { status: 'allow' }
    return {
      status: 'reject',
      ...(gate.reason === undefined ? {} : { reason: gate.reason }),
      ...(gate.fix === undefined ? {} : { fix: gate.fix }),
    }
  }
}

function createToolLoopNudge(
  runtimeBinding: AgentWorkflowNodeRuntimeBinding,
): (context: AiAgentToolLoopNudgeContext) => string | undefined {
  const toolLoopNudge = runtimeBinding.toolLoopNudge
  return context => {
    if (toolLoopNudge === undefined) return undefined
    const template = toolLoopNudge.templates[context.reason]
    if (template === undefined) return undefined
    return interpolateRuntimeTemplate(template, {
      reason: context.reason,
      moduleId: context.runtimeContext.moduleId,
      moduleInstanceId: context.moduleInstanceId,
      instanceId: context.runtimeContext.instanceId,
      'runtimeContext.moduleId': context.runtimeContext.moduleId,
      'runtimeContext.moduleInstanceId': context.runtimeContext.moduleInstanceId,
      'runtimeContext.instanceId': context.runtimeContext.instanceId,
    })
  }
}

function interpolateRuntimeTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu, (_match, key: string) => values[key] ?? '')
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`Agent workflow runtime ${field} must not be empty.`)
  }
  return normalized
}
