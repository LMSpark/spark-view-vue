/**
 * @module @spark-appworks/spark-ai:agent/business/business-factory
 * 职责：定义业务工厂验收报告和 F0-F9 工作流图 DTO，并把 Host dryRun 结果投影为首版工厂诊断。
 * 边界：只做无 UI、无 APP 交付执行的诊断投影；不调用 LLM、不执行工具、不保存或回滚业务产物。
 * AI用途：需要展示或验证业务工厂阶段状态时，用本模块确认报告、节点和检查项的稳定契约。
 */

import type { AiAgentHostDryRunResult, AiAgentHostRegistrationDescription } from './ai-host'

export type BusinessFactoryWorkflowPhaseId =
  | 'F0'
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'

export type BusinessFactoryWorkflowPhaseKind =
  | 'identity'
  | 'materials'
  | 'knowledge'
  | 'contract'
  | 'runtime'
  | 'governance'
  | 'acceptance'
  | 'activation'
  | 'workOrder'
  | 'delivery'

export type BusinessFactoryCheckStatus = 'pass' | 'warn' | 'fail'

export type BusinessFactoryCheck = Readonly<{
  phase: BusinessFactoryWorkflowPhaseKind
  status: BusinessFactoryCheckStatus
  code: string
  message: string
  evidence?: unknown
  fix?: string
}>

export type BusinessFactoryAcceptanceReport = Readonly<{
  alias: string
  moduleId: string
  rootClassName: string
  status: BusinessFactoryCheckStatus
  checks: readonly BusinessFactoryCheck[]
}>

export type BusinessFactoryWorkflowNodeStatus =
  | 'idle'
  | 'ready'
  | 'running'
  | 'passed'
  | 'warning'
  | 'failed'

export type BusinessFactoryWorkflowGraphNode = Readonly<{
  id: BusinessFactoryWorkflowPhaseId
  type: 'businessFactoryPhase'
  position: { x: number; y: number }
  data: {
    phaseId: BusinessFactoryWorkflowPhaseId
    acceptancePhase: BusinessFactoryWorkflowPhaseKind
    title: string
    goal: string
    input: string
    output: string
    acceptance: string
    source: string
    status: BusinessFactoryWorkflowNodeStatus
    details: readonly string[]
    checks: readonly BusinessFactoryCheck[]
  }
}>

export type BusinessFactoryWorkflowGraphEdge = Readonly<{
  id: string
  source: BusinessFactoryWorkflowPhaseId
  target: BusinessFactoryWorkflowPhaseId
  type: 'smoothstep'
  animated: boolean
  label: string
  data: {
    status: BusinessFactoryWorkflowNodeStatus
  }
}>

export type BusinessFactoryWorkflowGraph = Readonly<{
  nodes: readonly BusinessFactoryWorkflowGraphNode[]
  edges: readonly BusinessFactoryWorkflowGraphEdge[]
}>

export type BusinessFactoryAcceptanceReportInput = Readonly<{
  alias: string
  moduleId?: string
  rootClassName?: string
  description?: AiAgentHostRegistrationDescription
  dryRun: AiAgentHostDryRunResult
  materialsChecks?: readonly BusinessFactoryCheck[]
  knowledgeChecks?: readonly BusinessFactoryCheck[]
  governanceChecks?: readonly BusinessFactoryCheck[]
  deliveryChecks?: readonly BusinessFactoryCheck[]
}>

type BusinessFactoryPhaseDefinition = Readonly<{
  id: BusinessFactoryWorkflowPhaseId
  phase: BusinessFactoryWorkflowPhaseKind
  title: string
  goal: string
  input: string
  output: string
  acceptance: string
  source: string
  position: { x: number; y: number }
}>

type BusinessFactoryIdentityCheckInput = Readonly<{
  alias: string
  moduleId: string
  rootClassName: string
  expectedModuleId?: string
  expectedRootClassName?: string
  observedModuleId?: string
  observedRootClassName?: string
}>

const PHASE_DEFINITIONS: readonly BusinessFactoryPhaseDefinition[] = Object.freeze([
  {
    id: 'F0',
    phase: 'identity',
    title: '能力定义',
    goal: '明确这是哪类业务能力',
    input: 'alias / moduleId / rootClassName',
    output: 'BusinessCapabilityIdentity',
    acceptance: 'alias 稳定；moduleId 唯一；rootClassName 存在',
    source: 'ensureXxxBusiness()',
    position: { x: 0, y: 0 },
  },
  {
    id: 'F1',
    phase: 'materials',
    title: '原料绑定',
    goal: '绑定领域根对象和 APP 上下文',
    input: 'moduleClass / instance / resolveInstance / delivery context',
    output: 'BusinessFactoryMaterials',
    acceptance: '领域实例可解析；业务实例和 alias 不混用',
    source: 'APP service',
    position: { x: 260, y: 0 },
  },
  {
    id: 'F2',
    phase: 'knowledge',
    title: '知识绑定',
    goal: '让 LLM 可查 API',
    input: 'manifest / knowledge provider / rootClassName',
    output: '可查询知识闭包',
    acceptance: 'root class、子模型链和 componentIndex 可查',
    source: 'ClassModelKnowledgeService',
    position: { x: 520, y: 0 },
  },
  {
    id: 'F3',
    phase: 'contract',
    title: '工单契约',
    goal: '把外部请求变成可执行任务',
    input: 'paramsSchema / identityField / normalize',
    output: 'AiAgentInputContract',
    acceptance: 'normalize 前后 schema 均通过；scope 与 identity 一致',
    source: 'createAiAgentTask()',
    position: { x: 780, y: 0 },
  },
  {
    id: 'F4',
    phase: 'runtime',
    title: '运行时装配',
    goal: '组装工具闭集和 script 执行器',
    input: 'moduleClass / runtime options / knowledge / script runner',
    output: 'AiAgentToolRuntime',
    acceptance: 'runtime.inspect() 可解释；工具参数白名单正确',
    source: 'ClassModelAgentAdapter',
    position: { x: 1040, y: 0 },
  },
  {
    id: 'F5',
    phase: 'governance',
    title: '治理接入',
    goal: '控制工具调用过程',
    input: 'before/after hooks / nudge / recovery / maxToolRounds',
    output: 'lifecycle policy',
    acceptance: 'mutation gate、生效阶段和失败恢复策略明确',
    source: 'tool-loop / executor',
    position: { x: 1040, y: 240 },
  },
  {
    id: 'F6',
    phase: 'acceptance',
    title: '工厂验收',
    goal: '注册前做出厂检查',
    input: 'sample input / runtime inspect / knowledge query / delivery plan',
    output: 'BusinessFactoryAcceptanceReport',
    acceptance: 'dryRun、guide/script 链路和 delivery 策略可解释',
    source: 'host.inspectFactory()',
    position: { x: 780, y: 240 },
  },
  {
    id: 'F7',
    phase: 'activation',
    title: '激活注册',
    goal: '把能力包接入 Host',
    input: 'alias / moduleId / registrationProvider',
    output: 'registry + alias map',
    acceptance: 'alias 幂等；moduleId 不冲突；registration.moduleId 一致',
    source: 'Host.ensure()',
    position: { x: 520, y: 240 },
  },
  {
    id: 'F8',
    phase: 'workOrder',
    title: '工单生产',
    goal: '执行一次业务请求',
    input: 'alias / input / chat options',
    output: 'session + tool loop result',
    acceptance: 'input 合法；session 可追踪；tool result 可诊断',
    source: 'Host.run()',
    position: { x: 260, y: 240 },
  },
  {
    id: 'F9',
    phase: 'delivery',
    title: '交付回执',
    goal: '把 Working Copy 出厂',
    input: 'dirty state / delivery context',
    output: 'save / rollback / trace result',
    acceptance: '成功才保存；失败 rollback；回执进入 resultExtras',
    source: 'AiDeliveryPort',
    position: { x: 0, y: 240 },
  },
])

const PHASE_EDGES: ReadonlyArray<Readonly<{
  source: BusinessFactoryWorkflowPhaseId
  target: BusinessFactoryWorkflowPhaseId
  label: string
}>> = Object.freeze([
  { source: 'F0', target: 'F1', label: 'define' },
  { source: 'F1', target: 'F2', label: 'bind' },
  { source: 'F2', target: 'F3', label: 'contract' },
  { source: 'F3', target: 'F4', label: 'assemble' },
  { source: 'F4', target: 'F5', label: 'govern' },
  { source: 'F5', target: 'F6', label: 'accept' },
  { source: 'F6', target: 'F7', label: 'activate' },
  { source: 'F7', target: 'F8', label: 'run' },
  { source: 'F8', target: 'F9', label: 'deliver' },
])

export function createBusinessFactoryAcceptanceReport(
  input: BusinessFactoryAcceptanceReportInput,
): BusinessFactoryAcceptanceReport {
  const observedModuleId = readDryRunModuleId(input.dryRun) ?? input.description?.moduleId
  const observedRootClassName = readDryRunRootClassName(input.dryRun)
    ?? input.description?.inspectReport.rootKinds[0]
  const moduleId = firstNonEmpty(observedModuleId, input.moduleId)
  const rootClassName = firstNonEmpty(observedRootClassName, input.rootClassName)
  const checks = [
    ...createIdentityChecks({
      alias: input.alias,
      moduleId,
      rootClassName,
      ...(input.moduleId === undefined ? {} : { expectedModuleId: input.moduleId }),
      ...(input.rootClassName === undefined ? {} : { expectedRootClassName: input.rootClassName }),
      ...(observedModuleId === undefined ? {} : { observedModuleId }),
      ...(observedRootClassName === undefined ? {} : { observedRootClassName }),
    }),
    ...createMaterialsChecks(input.materialsChecks),
    ...createKnowledgeChecks(input.knowledgeChecks),
    ...createContractChecks(input.dryRun),
    ...createRuntimeChecks(input.dryRun, input.description),
    ...createGovernanceChecks(input.governanceChecks),
    ...createActivationChecks(input.dryRun, input.description),
    ...createDeliveryChecks(input.deliveryChecks),
  ]
  const status = aggregateCheckStatus(checks)
  const acceptanceCheck: BusinessFactoryCheck = {
    phase: 'acceptance',
    status,
    code: 'BUSINESS_FACTORY_ACCEPTANCE_SUMMARY',
    message: status === 'fail'
      ? '业务工厂验收失败。'
      : status === 'warn'
        ? '业务工厂验收通过基础检查，但仍有未验证或需确认项。'
        : '业务工厂验收通过。',
  }
  return {
    alias: input.alias,
    moduleId,
    rootClassName,
    status,
    checks: [...checks, acceptanceCheck],
  }
}

export function createBusinessFactoryWorkflowGraph(
  report: BusinessFactoryAcceptanceReport,
): BusinessFactoryWorkflowGraph {
  const nodes = PHASE_DEFINITIONS.map((definition): BusinessFactoryWorkflowGraphNode => {
    const checks = report.checks.filter(check => check.phase === definition.phase)
    const status = workflowNodeStatusFromDefinition(definition, checks, report)
    return {
      id: definition.id,
      type: 'businessFactoryPhase',
      position: definition.position,
      data: {
        phaseId: definition.id,
        acceptancePhase: definition.phase,
        title: definition.title,
        goal: definition.goal,
        input: definition.input,
        output: definition.output,
        acceptance: definition.acceptance,
        source: definition.source,
        status,
        details: createNodeDetails(definition, report),
        checks,
      },
    }
  })
  const statusById = new Map(nodes.map(node => [node.id, node.data.status]))
  const edges = PHASE_EDGES.map((edge): BusinessFactoryWorkflowGraphEdge => ({
    id: `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: false,
    label: edge.label,
    data: {
      status: statusById.get(edge.target) ?? 'idle',
    },
  }))
  return {
    nodes,
    edges,
  }
}

function createIdentityChecks(
  input: BusinessFactoryIdentityCheckInput,
): readonly BusinessFactoryCheck[] {
  const checks: BusinessFactoryCheck[] = []
  checks.push(textCheck('identity', 'BUSINESS_FACTORY_ALIAS_PRESENT', input.alias, 'alias 已提供。', 'alias 为空。'))
  checks.push(textCheck('identity', 'BUSINESS_FACTORY_MODULE_ID_PRESENT', input.moduleId, 'moduleId 已提供。', 'moduleId 为空。'))
  checks.push(textCheck('identity', 'BUSINESS_FACTORY_ROOT_CLASS_PRESENT', input.rootClassName, 'rootClassName 已提供。', 'rootClassName 为空。'))
  const moduleIdMismatch = mismatchCheck(
    'BUSINESS_FACTORY_MODULE_ID_MISMATCH',
    input.expectedModuleId,
    input.observedModuleId,
    '声明 moduleId 与 Host 注册结果不一致。',
  )
  if (moduleIdMismatch !== undefined) checks.push(moduleIdMismatch)
  const rootClassMismatch = mismatchCheck(
    'BUSINESS_FACTORY_ROOT_CLASS_MISMATCH',
    input.expectedRootClassName,
    input.observedRootClassName,
    '声明 rootClassName 与 runtime.inspect() 结果不一致。',
  )
  if (rootClassMismatch !== undefined) checks.push(rootClassMismatch)
  return checks
}

function createMaterialsChecks(
  checks: readonly BusinessFactoryCheck[] | undefined,
): readonly BusinessFactoryCheck[] {
  if (checks !== undefined && checks.length > 0) return checks
  return [warnCheck(
    'materials',
    'BUSINESS_FACTORY_MATERIALS_NOT_DECLARED',
    '未提供 materials 检查；当前报告无法证明领域实例解析策略。',
    '在业务接入层声明 moduleClass、instance/resolveInstance 和 APP 上下文绑定策略。',
  )]
}

function createKnowledgeChecks(
  checks: readonly BusinessFactoryCheck[] | undefined,
): readonly BusinessFactoryCheck[] {
  if (checks !== undefined && checks.length > 0) return checks
  return [warnCheck(
    'knowledge',
    'BUSINESS_FACTORY_KNOWLEDGE_SMOKE_NOT_RUN',
    '未提供知识 smoke test；当前报告无法证明 root、子模型链和 guide 查询真实可用。',
    '至少补一条 model_query、一条 guide 查询和关键子模型闭包检查。',
  )]
}

function createContractChecks(dryRun: AiAgentHostDryRunResult): readonly BusinessFactoryCheck[] {
  if (!dryRun.ok) {
    return [failCheck(
      'contract',
      'BUSINESS_FACTORY_DRY_RUN_FAILED',
      dryRun.error.message,
      '先修复 dryRun 失败，再进入工厂验收后续阶段。',
    )]
  }
  return [{
    phase: 'contract',
    status: 'pass',
    code: 'BUSINESS_FACTORY_CONTRACT_DRY_RUN_PASSED',
    message: 'dryRun 输入契约、normalize、scope 和 orchestration 已通过。',
    evidence: {
      normalizedInput: dryRun.normalizedInput,
      scope: dryRun.scope,
      orchestrationSummary: dryRun.orchestrationSummary,
    },
  }]
}

function createRuntimeChecks(
  dryRun: AiAgentHostDryRunResult,
  description: AiAgentHostRegistrationDescription | undefined,
): readonly BusinessFactoryCheck[] {
  const inspectReport = dryRun.ok ? dryRun.inspectReport : description?.inspectReport
  if (inspectReport === undefined) {
    return [failCheck(
      'runtime',
      'BUSINESS_FACTORY_RUNTIME_INSPECT_MISSING',
      'runtime.inspect() 未执行或无可用报告。',
      '确认 alias 已注册且 registration.runtime.inspect() 可调用。',
    )]
  }
  const checks: BusinessFactoryCheck[] = [{
    phase: 'runtime',
    status: inspectStatusToCheckStatus(inspectReport.status),
    code: 'BUSINESS_FACTORY_RUNTIME_INSPECT',
    message: `runtime.inspect() status=${inspectReport.status}; moduleCount=${inspectReport.moduleCount}; rootKinds=[${inspectReport.rootKinds.join(', ')}]`,
    evidence: inspectReport,
  }]
  for (const finding of inspectReport.findings) {
    checks.push({
      phase: 'runtime',
      status: finding.level === 'error' ? 'fail' : finding.level === 'warn' ? 'warn' : 'pass',
      code: finding.code,
      message: finding.message,
      ...(finding.fix === undefined ? {} : { fix: finding.fix }),
    })
  }
  return checks
}

function createGovernanceChecks(
  checks: readonly BusinessFactoryCheck[] | undefined,
): readonly BusinessFactoryCheck[] {
  if (checks !== undefined && checks.length > 0) return checks
  return [warnCheck(
    'governance',
    'BUSINESS_FACTORY_GOVERNANCE_NOT_DECLARED',
    '未提供治理策略检查；当前报告无法证明 gate、nudge、recovery 和 maxToolRounds 策略。',
    '在 registration 或 Host options 中声明并测试治理策略。',
  )]
}

function createActivationChecks(
  dryRun: AiAgentHostDryRunResult,
  description: AiAgentHostRegistrationDescription | undefined,
): readonly BusinessFactoryCheck[] {
  if (dryRun.ok && description !== undefined) {
    return [{
      phase: 'activation',
      status: 'pass',
      code: 'BUSINESS_FACTORY_ACTIVATION_REGISTERED',
      message: 'alias 已激活，moduleId 与 registration 可查询。',
      evidence: {
        alias: dryRun.alias,
        moduleId: dryRun.moduleId,
        description,
      },
    }]
  }
  if (description !== undefined) {
    return [warnCheck(
      'activation',
      'BUSINESS_FACTORY_ACTIVATION_DESCRIBED_WITH_DRY_RUN_FAILURE',
      'alias 可 describe，但 dryRun 未通过。',
      '先修复 inputContract 或 sampleInput。',
    )]
  }
  return [failCheck(
    'activation',
    'BUSINESS_FACTORY_ACTIVATION_MISSING',
    'alias 未激活或无法 describe。',
    '先调用 host.ensure(alias, { moduleId, create }) 注册业务能力。',
  )]
}

function createDeliveryChecks(
  checks: readonly BusinessFactoryCheck[] | undefined,
): readonly BusinessFactoryCheck[] {
  if (checks !== undefined && checks.length > 0) return checks
  return [warnCheck(
    'delivery',
    'BUSINESS_FACTORY_DELIVERY_NOT_DECLARED',
    '未提供 delivery plan；当前报告无法证明 save、rollback、trace 和 resultExtras 策略。',
    '在 APP Host Run provider 或业务 runner 中声明 AiDeliveryPort 策略。',
  )]
}

function textCheck(
  phase: BusinessFactoryWorkflowPhaseKind,
  code: string,
  value: string,
  passMessage: string,
  failMessage: string,
): BusinessFactoryCheck {
  if (value.trim().length > 0) {
    return {
      phase,
      status: 'pass',
      code,
      message: passMessage,
      evidence: value,
    }
  }
  return failCheck(phase, code, failMessage)
}

function warnCheck(
  phase: BusinessFactoryWorkflowPhaseKind,
  code: string,
  message: string,
  fix?: string,
): BusinessFactoryCheck {
  return {
    phase,
    status: 'warn',
    code,
    message,
    ...(fix === undefined ? {} : { fix }),
  }
}

function failCheck(
  phase: BusinessFactoryWorkflowPhaseKind,
  code: string,
  message: string,
  fix?: string,
): BusinessFactoryCheck {
  return {
    phase,
    status: 'fail',
    code,
    message,
    ...(fix === undefined ? {} : { fix }),
  }
}

function inspectStatusToCheckStatus(status: 'ok' | 'warning' | 'error'): BusinessFactoryCheckStatus {
  if (status === 'error') return 'fail'
  if (status === 'warning') return 'warn'
  return 'pass'
}

function aggregateCheckStatus(checks: readonly BusinessFactoryCheck[]): BusinessFactoryCheckStatus {
  if (checks.some(check => check.status === 'fail')) return 'fail'
  if (checks.some(check => check.status === 'warn')) return 'warn'
  return 'pass'
}

function workflowNodeStatusFromDefinition(
  definition: BusinessFactoryPhaseDefinition,
  checks: readonly BusinessFactoryCheck[],
  report: BusinessFactoryAcceptanceReport,
): BusinessFactoryWorkflowNodeStatus {
  if (checks.length > 0) {
    const status = aggregateCheckStatus(checks)
    if (status === 'fail') return 'failed'
    if (status === 'warn') return 'warning'
    return 'passed'
  }
  if (definition.phase === 'workOrder' && isWorkOrderReady(report)) return 'ready'
  return 'idle'
}

function isWorkOrderReady(report: BusinessFactoryAcceptanceReport): boolean {
  return !report.checks.some(check => isWorkOrderPrerequisiteFailure(check))
    && hasPassingCheck(report, 'contract')
    && hasPassingCheck(report, 'activation')
}

function isWorkOrderPrerequisiteFailure(check: BusinessFactoryCheck): boolean {
  if (check.status !== 'fail') return false
  switch (check.phase) {
    case 'identity':
    case 'materials':
    case 'knowledge':
    case 'contract':
    case 'runtime':
    case 'governance':
    case 'activation':
      return true
    case 'acceptance':
    case 'delivery':
    case 'workOrder':
      return false
  }
}

function hasPassingCheck(
  report: BusinessFactoryAcceptanceReport,
  phase: BusinessFactoryWorkflowPhaseKind,
): boolean {
  return report.checks.some(check => check.phase === phase && check.status === 'pass')
}

function readDryRunModuleId(dryRun: AiAgentHostDryRunResult): string | undefined {
  return dryRun.ok ? dryRun.moduleId : undefined
}

function readDryRunRootClassName(dryRun: AiAgentHostDryRunResult): string | undefined {
  if (!dryRun.ok) return undefined
  return dryRun.inspectReport.rootKinds[0]
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find(value => value !== undefined && value.trim().length > 0) ?? ''
}

function mismatchCheck(
  code: string,
  expected: string | undefined,
  observed: string | undefined,
  message: string,
): BusinessFactoryCheck | undefined {
  if (expected === undefined || observed === undefined) return undefined
  if (expected.trim().length === 0 || observed.trim().length === 0) return undefined
  if (expected === observed) return undefined
  return {
    phase: 'identity',
    status: 'fail',
    code,
    message,
    evidence: {
      expected,
      observed,
    },
    fix: '以 Host.ensure() 注册事实和 runtime.inspect() 输出为准，修正业务工厂接入配置。',
  }
}

function createNodeDetails(
  definition: BusinessFactoryPhaseDefinition,
  report: BusinessFactoryAcceptanceReport,
): readonly string[] {
  const details = [
    `alias=${report.alias}`,
    `moduleId=${report.moduleId}`,
    `rootClassName=${report.rootClassName}`,
    `phase=${definition.phase}`,
  ]
  return details.filter(item => !item.endsWith('='))
}
