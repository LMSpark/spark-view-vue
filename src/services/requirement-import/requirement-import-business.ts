/**
 * @module app:services/requirement-import-business
 * 职责：提供应用运行时 service 层的 requirement import business 能力，连接需求文档解析、AI Host 与项目模型。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查需求导入 Agent 如何注册和运行时，用本模块确认运行时接线。
 */
/**
 * 需求文档导入 AI 输入契约与 Host 业务注册。
 *
 * 导入阶段消费需求文档正文，产出子模块/页面概要（导航树 + 页面描述）；
 * 不绑定 pageDesign 四文件或 config-page metadata。
 */
import {
  activateAgentWorkflowDefinition,
  createSimpleInputContract,
  ClassModelAgentAdapter,
  type AgentWorkflowDefinition,
  type AiAgentBeforeFunctionCallDirective,
  type AiAgentBeforeFunctionCallOptions,
  type AiAgentHost,
  type AiAgentRuntimeContext,
  type AiAgentToolLoopNudgeContext,
} from '@/services/ai/spark-ai-agent-bindings'
import {
  CLASS_MODEL_TOOL_NAMES,
  createWorkerDtsClassModelKnowledgeProvider,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import {
  ProjectModel,
  type ProjectWorkspace,
} from '@spark-appworks/spark-project-model'
import { getDtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

export const REQUIREMENT_IMPORT_MODULE_ID = 'requirementImport'

const REQUIREMENT_IMPORT_ROOT_CLASS_NAME = 'ProjectModel'
const REQUIREMENT_IMPORT_WORKFLOW_ID = 'agent.workflow.requirementImport'
const REQUIREMENT_IMPORT_REGISTRATION_BINDING_KEY = 'requirementImport.registration'
const REQUIREMENT_IMPORT_WORKFLOW_PUBLISHED_AT = '1970-01-01T00:00:00.000Z'

function createRequirementImportClassModelKnowledgeProvider(): ClassModelKnowledgeProvider {
  return createWorkerDtsClassModelKnowledgeProvider({
    workerUrl: new URL('../class-model-knowledge.worker.ts', import.meta.url),
    dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
    rootClassName: REQUIREMENT_IMPORT_ROOT_CLASS_NAME,
  })
}

/** Requirement Import Agent Input 的输入数据。 */
export type RequirementImportAgentInput = Readonly<{
  /** Agent 输入的身份键（通常等于 projectId）。 */
  projectScopeKey: string
  /** 项目唯一标识。 */
  projectId: string
  /** 需求文档正文（由 docx-parser 从 .docx 提取）。 */
  documentText: string
  /** 项目名称（可选，用于 system prompt 上下文）。 */
  projectName?: string
}>

/** Build Requirement Import Agent Input Options 的调用配置。 */
export type BuildRequirementImportAgentInputOptions = Readonly<{
  /** 项目名称（可选）。 */
  projectName?: string
}>

/**
 * 构建需求导入 Agent 输入。
 */
export function buildRequirementImportAgentInput(
  projectId: string,
  documentText: string,
  options: BuildRequirementImportAgentInputOptions = {},
): RequirementImportAgentInput {
  return {
    projectScopeKey: projectId,
    projectId,
    documentText,
    ...(options.projectName === undefined ? {} : { projectName: options.projectName }),
  }
}

/** Ensure Requirement Import Business Options 的调用配置。 */
export type EnsureRequirementImportBusinessOptions = Readonly<{
  /** AI Agent Host 实例。 */
  host: AiAgentHost
  /** 按 moduleInstanceId 获取 ProjectWorkspace 编辑器。 */
  getRequirementImportEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
  /** Node/E2E 可注入非 Worker knowledge provider；浏览器生产默认使用 Worker provider。 */
  knowledge?: ClassModelKnowledgeProvider
}>

export function ensureRequirementImportBusiness(options: EnsureRequirementImportBusinessOptions): AiAgentHost {
  return activateAgentWorkflowDefinition({
    host: options.host,
    definition: createRequirementImportAgentWorkflowDefinition(),
    bindings: {
      registrations: {
        [REQUIREMENT_IMPORT_REGISTRATION_BINDING_KEY]: {
          moduleId: REQUIREMENT_IMPORT_MODULE_ID,
          create: () => createRequirementImportRegistration(options),
        },
      },
    },
  })
}

export function createRequirementImportAgentWorkflowDefinition(): AgentWorkflowDefinition {
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: REQUIREMENT_IMPORT_WORKFLOW_ID,
    source: {
      designKind: 'agent.workflow.design',
      designId: REQUIREMENT_IMPORT_WORKFLOW_ID,
      designVersion: 1,
    },
    factory: {
      identity: {
        phaseId: 'F0',
        phase: 'identity',
        sectionPath: 'factory.identity',
        publishPath: 'workflow.factory.identity',
        value: {
          alias: REQUIREMENT_IMPORT_MODULE_ID,
          moduleId: REQUIREMENT_IMPORT_MODULE_ID,
          rootClassName: REQUIREMENT_IMPORT_ROOT_CLASS_NAME,
        },
      },
      materials: {
        phaseId: 'F1',
        phase: 'materials',
        sectionPath: 'factory.materials',
        publishPath: 'workflow.factory.materials',
        value: {
          moduleClass: 'ProjectModel',
          editorResolver: 'getRequirementImportEditor',
        },
      },
      knowledge: {
        phaseId: 'F2',
        phase: 'knowledge',
        sectionPath: 'factory.knowledge',
        publishPath: 'workflow.factory.knowledge',
        value: {
          rootClassName: REQUIREMENT_IMPORT_ROOT_CLASS_NAME,
          provider: 'dtsClassModelWorker',
        },
      },
      contract: {
        phaseId: 'F3',
        phase: 'contract',
        sectionPath: 'factory.contract',
        publishPath: 'workflow.factory.contract',
        value: {
          identityField: 'projectScopeKey',
          messageField: 'documentText',
        },
      },
      runtime: {
        phaseId: 'F4',
        phase: 'runtime',
        sectionPath: 'factory.runtime',
        publishPath: 'workflow.factory.runtime',
        value: {
          adapter: 'ClassModelAgentAdapter',
          executionToolNames: [CLASS_MODEL_TOOL_NAMES.script],
          agentCompleteMethodName: 'completeProjectPlanning',
        },
      },
      governance: {
        phaseId: 'F5',
        phase: 'governance',
        sectionPath: 'factory.governance',
        publishPath: 'workflow.factory.governance',
        value: {
          beforeFunctionCall: 'requirementImportToolGate',
          toolLoopNudge: 'requirementImport',
        },
      },
      acceptance: {
        phaseId: 'F6',
        phase: 'acceptance',
        sectionPath: 'factory.acceptance',
        publishPath: 'workflow.factory.acceptance',
        value: {
          dryRun: true,
          inspectFactory: true,
        },
      },
      activation: {
        phaseId: 'F7',
        phase: 'activation',
        sectionPath: 'factory.activation',
        publishPath: 'workflow.factory.activation',
        value: {
          registrationBindingKey: REQUIREMENT_IMPORT_REGISTRATION_BINDING_KEY,
        },
      },
      workOrder: {
        phaseId: 'F8',
        phase: 'workOrder',
        sectionPath: 'factory.workOrder',
        publishPath: 'workflow.factory.workOrder',
        value: {
          hostRunAlias: REQUIREMENT_IMPORT_MODULE_ID,
        },
      },
      delivery: {
        phaseId: 'F9',
        phase: 'delivery',
        sectionPath: 'factory.delivery',
        publishPath: 'workflow.factory.delivery',
        value: {
          mode: 'appDeliveryPort',
          owner: 'requirementImportHostRunProvider',
        },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.definition.v1',
      publishedAt: REQUIREMENT_IMPORT_WORKFLOW_PUBLISHED_AT,
      validation: {
        status: 'valid',
        issues: [],
      },
    },
  }
}

function createRequirementImportRegistration(options: EnsureRequirementImportBusinessOptions) {
  return ClassModelAgentAdapter.createRegistration({
    moduleClass: ProjectModel,
    options: {
      moduleId: REQUIREMENT_IMPORT_MODULE_ID,
      rootClassName: REQUIREMENT_IMPORT_ROOT_CLASS_NAME,
      dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
      knowledge: options.knowledge ?? createRequirementImportClassModelKnowledgeProvider(),
      inputContract: createSimpleInputContract<RequirementImportAgentInput>({
        businessId: REQUIREMENT_IMPORT_MODULE_ID,
        identityField: 'projectScopeKey',
        messageField: 'documentText',
        paramsSchema: {
          type: 'object',
          properties: {
            projectScopeKey: { type: 'string' },
            projectId: { type: 'string' },
            documentText: { type: 'string' },
            projectName: { type: 'string' },
          },
          required: ['projectScopeKey', 'projectId', 'documentText'],
          additionalProperties: false,
        },
        systemPrompt: createRequirementImportSystemPrompt,
        title: input => `requirementImport:${input.projectId}`,
        readonlySteps: [
          '需求文档正文已注入 documentText。',
          '业务契约见 DTS ClassModel 知识索引（model_query / model_action_guide）。',
        ],
      }),
      resolveInstance: (ctx) => resolveRequirementImportDomainRoot(options, ctx),
      beforeFunctionCall: (_instance: ProjectModel, hookOptions) => evaluateRequirementImportBeforeFunctionCall(hookOptions),
      agentCompleteMethodName: 'completeProjectPlanning',
      executionToolNames: REQUIREMENT_IMPORT_EXECUTION_TOOL_NAMES,
      planWithoutToolMarkers: REQUIREMENT_IMPORT_PLAN_WITHOUT_TOOL_MARKERS,
      toolLoopNudge: createRequirementImportToolLoopNudge,
    },
  })
}

const REQUIREMENT_IMPORT_EXECUTION_TOOL_NAMES = new Set<string>([
  CLASS_MODEL_TOOL_NAMES.script,
])

const REQUIREMENT_IMPORT_PLAN_WITHOUT_TOOL_MARKERS = [
  'replacenavigationchildren',
  'readprojectplanninginput',
  'readnavigationplanninginputs',
] as const

function createRequirementImportToolLoopNudge(context: AiAgentToolLoopNudgeContext): string | undefined {
  const projectId = context.moduleInstanceId.trim()
  if (projectId.length === 0) return undefined
  switch (context.reason) {
    case 'plan_without_tool':
      return `projectId="${projectId}"；禁止只输出计划，下一回合必须发起 tool_call（见 model_action_guide / RECOVERY_HINT）。`
    case 'execution_phase':
      return `projectId="${projectId}"；目录/指南阶段已完成，直接 model_script：根对象是 this（ProjectModel），先 await this.readProjectPlanningInput() / await this.readNavigationPlanningInputs()，完成后 await this.replaceNavigationChildren({ children })；children 必须包含 module 及其 page 子节点，不能只有 module 壳。`
    case 'model_script_retry':
      return `projectId="${projectId}"；按 RECOVERY_HINT 修正后重试 model_script；导航策划必须包含至少一个 nodeKind="page" 的页面概要。`
    default:
      return undefined
  }
}

function createRequirementImportSystemPrompt(input: RequirementImportAgentInput): string {
  return [
    `当前 requirementImport 项目: ${input.projectId}${input.projectName ? ` (${input.projectName})` : ''}`,
    '需求文档正文:',
    input.documentText,
    '',
    '知识索引: DTS ClassModel（ProjectModel 根模型）；只把 ClassModel 当作模型知识索引，需求导入语义只在 App 层本业务内编排。',
    '职责边界: LLM 只负责发出 model_script({ script }) tool_call；script 必须是 JavaScript async function body；禁止 TS/TSX/JSX、类型注解、import/export、函数包裹；运行时负责把 this 绑定到 ProjectModel 并执行脚本。',
    '执行规则: 不要把脚本写成普通文本回答；最终必须通过 model_script 的 script 字符串调用 this.xxx。',
    '知识查询规则: action 只用 model_action_guide({ kind: "ProjectModel", actionName }) 查询；attribute 才用 model_attribute_guide；replaceNavigationChildren/readProjectPlanningInput/readNavigationPlanningInputs 都是 action。',
    '参数契约规则: 不要查询 ProjectNodeData 当作 attribute；children 的结构来自 model_action_guide({ kind: "ProjectModel", actionName: "replaceNavigationChildren" }) 的 paramsSchema.children。',
    '执行前查询: model_action_guide({ kind: "ProjectModel", actionName: "readProjectPlanningInput" }) + model_action_guide({ kind: "ProjectModel", actionName: "readNavigationPlanningInputs" }) + model_action_guide({ kind: "ProjectModel", actionName: "replaceNavigationChildren" })，然后 model_script 读取输入并写入 navigation children 概要。',
    '导航结构规则: 根据需求文档内容，按业务域生成 module；每个主要 module 至少包含 1 个 nodeKind="page" 的 children 页面概要；禁止只生成一组 module 壳。',
    '页面概要规则: 每个 page 节点的 description 应概括该页面的核心功能和用户场景，来源于需求文档对应章节。',
    '完成自检: agent_complete 会调用 ProjectModel.completeProjectPlanning({ summary })；如果返回失败，按 tool result 的 missingFacts/requiredCapabilities/知识恢复提示补查或补执行后再次 agent_complete。',
    '不要在 model_script 中直接调用 completeProjectPlanning；完成只通过 agent_complete FC 触发。',
    ...requirementImportScriptSopLines(input.projectId),
    '输出要求: children 节点使用稳定英文 id/path，title/description 承载本轮产品需求的模块与页面概要；不调用 openPageDesign/writePageFile/readPageFileText。',
    '模型来源: generated/dts-class-model。',
  ].join('\n')
}

function requirementImportScriptSopLines(projectId: string): readonly string[] {
  return [
    'model_script 标准写法：以下内容必须作为 tool_call 参数 script 的 JavaScript 函数体交给运行时执行；不要作为自然语言回答。',
    '根对象就是 this（ProjectModel）；通过 this.replaceNavigationChildren({ children }) 写入导航策划。',
    '业务功能不要只写 module；module 必须带 children page，页面概要必须使用 nodeKind: "page"。',
    'const projectInput = await this.readProjectPlanningInput()',
    'const existingNodes = await this.readNavigationPlanningInputs()',
    'const children = [',
    '  {',
    '    id: "core-module",',
    '    title: "核心模块",',
    '    nodeKind: "module",',
    '    path: "/core",',
    '    description: projectInput.requirement,',
    '    children: [',
    '      { id: "core-overview", title: "核心总览", nodeKind: "page", path: "/core/overview", description: "核心模块总览与关键任务入口" }',
    '    ]',
    '  }',
    ']',
    'const navigationRoot = await this.replaceNavigationChildren({ children })',
    'if (!JSON.stringify(navigationRoot.children).includes(\'"nodeKind":"page"\')) throw new Error("requirementImport requires page nodes")',
    `return { kind: "requirementImportResult", projectId: "${projectId}", navigationRoot, previousNodeCount: existingNodes.length }`,
  ]
}

function resolveRequirementImportDomainRoot(
  options: EnsureRequirementImportBusinessOptions,
  ctx: AiAgentRuntimeContext,
): ProjectModel {
  const moduleInstanceId = ctx.moduleInstanceId.trim()
  if (moduleInstanceId.length === 0) {
    throw new Error('requirementImport ProjectModel requires host.moduleInstanceId.')
  }
  const editor = options.getRequirementImportEditor({ moduleInstanceId })
  if (editor.project.projectId !== moduleInstanceId) {
    throw new Error(
      `requirementImport editor mismatch: expected "${moduleInstanceId}", got "${editor.project.projectId}".`,
    )
  }
  return editor.project
}

function evaluateRequirementImportBeforeFunctionCall(
  options: AiAgentBeforeFunctionCallOptions,
): AiAgentBeforeFunctionCallDirective {
  const gate = evaluateRequirementImportToolGate(options)
  if (gate.ok) {
    return { status: 'allow' }
  }
  return {
    status: 'reject',
    reason: gate.reason ?? 'requirementImport gate rejected tool call.',
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
  }
}

/** Requirement Import Gate Validation Result 的返回结果。 */
export type RequirementImportGateValidationResult = Readonly<{
  /** 是否通过 tool gate 校验。 */
  ok: boolean
  /** 拒绝原因（ok 为 false 时）。 */
  reason?: string
  /** 给 LLM 的修正建议（ok 为 false 时）。 */
  fix?: string
}>

const FORBIDDEN_SCRIPT_MARKERS = [
  'openPageDesign',
  'writePageFile',
  'setFileText',
  'getFileText',
  'editNodeTree',
  'editDataSet',
  'getNodeTree',
  'getDataSetTool',
] as const

const PROJECT_ACTION_NAMES = [
  'readProjectPlanningInput',
  'readNavigationPlanningInputs',
  'replaceNavigationChildren',
] as const

const PROJECT_PARAM_TYPE_NAMES = [
  'ProjectNodeData',
] as const

export function evaluateRequirementImportToolGate(
  options: Pick<AiAgentBeforeFunctionCallOptions, 'toolName' | 'args'>,
): RequirementImportGateValidationResult {
  const toolName = normalizeRequirementImportToolName(options.toolName)
  const actionLookupGate = evaluateRequirementImportActionLookupGate(toolName, options.args)
  if (!actionLookupGate.ok) return actionLookupGate
  if (toolName !== 'model_script') {
    return { ok: true }
  }
  const script = readRequirementImportModelScriptBody(options.args)
  if (script === undefined) {
    return { ok: true }
  }
  const marker = findForbiddenRequirementImportScriptMarker(script)
  if (marker === undefined) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `requirementImport: model_script 禁止调用 ${marker}；本阶段只处理 navigation 策划，不涉及四文件或 openPageDesign。`,
    fix: '改用 readProjectPlanningInput / readNavigationPlanningInputs / replaceNavigationChildren 等 ProjectModel action；完成概要后 agent_complete。',
  }
}

function evaluateRequirementImportActionLookupGate(
  toolName: string,
  args: AiAgentBeforeFunctionCallOptions['args'],
): RequirementImportGateValidationResult {
  if (toolName !== 'model_attribute_guide') return { ok: true }
  const kind = readRequirementImportTextArg(args, 'kind')
  if (kind !== 'project') return { ok: true }
  const attributeName = readRequirementImportTextArg(args, 'attributeName')
  if (attributeName === undefined || !isProjectActionName(attributeName)) {
    if (attributeName !== undefined && isProjectParamTypeName(attributeName)) {
      return {
        ok: false,
        reason: `requirementImport: ${attributeName} 是参数结构名，不是 project attribute。`,
        fix: '改用 model_action_guide({ kind: "project", actionName: "replaceNavigationChildren" }) 查看 paramsSchema.children，然后在 model_script 中构造 children 数组。',
      }
    }
    return { ok: true }
  }
  return {
    ok: false,
    reason: `requirementImport: ${attributeName} 是 ProjectModel action，不是 attribute。`,
    fix: `改用 model_action_guide({ kind: "project", actionName: "${attributeName}" })，然后在 model_script 中通过 this.${attributeName}(...) 调用。`,
  }
}

function readRequirementImportModelScriptBody(args: AiAgentBeforeFunctionCallOptions['args']): string | undefined {
  const script = args['script']
  if (typeof script !== 'string') return undefined
  const trimmed = script.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function findForbiddenRequirementImportScriptMarker(script: string): string | undefined {
  for (const marker of FORBIDDEN_SCRIPT_MARKERS) {
    if (script.includes(marker)) return marker
  }
  return undefined
}

function readRequirementImportTextArg(args: AiAgentBeforeFunctionCallOptions['args'], key: string): string | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function isProjectActionName(value: string): value is typeof PROJECT_ACTION_NAMES[number] {
  return PROJECT_ACTION_NAMES.some(actionName => actionName === value)
}

function isProjectParamTypeName(value: string): value is typeof PROJECT_PARAM_TYPE_NAMES[number] {
  return PROJECT_PARAM_TYPE_NAMES.some(typeName => typeName === value)
}

function normalizeRequirementImportToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]/gu, '')
}
