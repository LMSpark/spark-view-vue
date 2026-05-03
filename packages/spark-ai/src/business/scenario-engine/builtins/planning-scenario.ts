import type { JsonSchema } from '../../../core/session/session-contracts'
import type { AiScenarioDefinition, AiScenarioTool } from '../scenario-types'
import { PLANNING_SCENARIO_SYSTEM_PROMPT } from '../scenario-prompt-template-registry'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：规划场景工具集协议
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 规划域工具集。
 * 对应"项目 -> 模块 -> 页面"的三层规划链路。
 */
export interface ProjectPlanningToolset {
  createProjectPlan: (args: unknown) => unknown
  createModulePlan: (args: unknown) => unknown
  createPagePlan: (args: unknown) => unknown
  validatePlan?: (args: unknown) => unknown
}

/**
 * 规划场景工厂参数。
 */
export interface CreatePlanningScenarioOptions {
  id?: string
  title?: string
  intents?: readonly string[]
  systemPrompt?: string
  toolset: ProjectPlanningToolset
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：JSON Schema（工具参数规范）
// ═══════════════════════════════════════════════════════════════════════════

const projectSchema: JsonSchema = {
  type: 'object',
  properties: {
    projectName: { type: 'string', description: '项目名称' },
    projectGoal: { type: 'string', description: '项目目标' },
    constraints: { type: 'array', items: { type: 'string' }, description: '关键约束' },
  },
  required: ['projectName', 'projectGoal'],
}

const moduleSchema: JsonSchema = {
  type: 'object',
  properties: {
    projectName: { type: 'string', description: '项目名称' },
    modules: { type: 'array', items: { type: 'string' }, description: '模块候选名列表' },
  },
  required: ['projectName'],
}

const pageSchema: JsonSchema = {
  type: 'object',
  properties: {
    moduleName: { type: 'string', description: '模块名' },
    pageGoals: { type: 'array', items: { type: 'string' }, description: '页面目标列表' },
  },
  required: ['moduleName'],
}

const validateSchema: JsonSchema = {
  type: 'object',
  properties: {
    plan: { type: 'object', properties: {}, description: '完整规划结果' },
  },
  required: ['plan'],
}

const planningPayloadSchema: JsonSchema = {
  type: 'object',
  properties: {
    userInput: { type: 'string', description: '用户原始业务需求' },
    projectId: { type: 'string', description: '可选：已有项目 ID' },
    projectName: { type: 'string', description: '项目名称' },
    projectGoal: { type: 'string', description: '项目目标' },
    constraints: { type: 'array', items: { type: 'string' }, description: '关键约束' },
    modules: { type: 'array', items: { type: 'string' }, description: '模块候选列表' },
    pageGoals: { type: 'array', items: { type: 'string' }, description: '页面目标列表' },
  },
  required: ['userInput'],
}

// ═══════════════════════════════════════════════════════════════════════════
// 流程分区：规划场景构建器
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建"项目-模块-页面"规划场景。
 *
 * 时序说明：
 * 1) 组装工具声明（tools）
 * 2) 注入 promptPolicy（约束 + 分级查询系统提示词）
 * 3) 定义 buildPayload（上下文 -> 载荷）
 * 4) 定义 buildSteps（默认执行顺序）
 *
 * 新增功能（分级查询）：
 * - systemPrompt 包含分级查询协议，强制 LLM 遵守"不猜测、不假设"原则
 * - 所有工具参数必须通过 registry.queryToolSchema 查询确认
 */
export function createPlanningScenario(options: CreatePlanningScenarioOptions): AiScenarioDefinition {
  const tools: AiScenarioTool[] = [
    {
      name: 'planning.createProjectPlan',
      description: '生成项目级规划（目标、里程碑、约束）',
      parameters: projectSchema,
      registration: {
        category: 'planning',
        tags: ['project', 'plan'],
        example: {
          projectName: '企业请假系统',
          projectGoal: '实现请假申请、审批、统计闭环',
          constraints: ['审批链可配置', '操作可审计'],
        },
        rules: ['必须先生成项目规划，再进行模块拆解'],
        failureCodes: ['INVALID_PARAMS', 'PROJECT_PLAN_BUILD_FAILED'],
        fixHints: ['补齐 projectName 与 projectGoal', '约束项建议使用字符串数组'],
      },
      execute: (args) => options.toolset.createProjectPlan(args),
    },
    {
      name: 'planning.createModulePlan',
      description: '基于项目目标生成模块拆解',
      parameters: moduleSchema,
      registration: {
        category: 'planning',
        tags: ['module', 'decompose'],
        example: {
          projectName: '企业请假系统',
          modules: ['员工申请', '审批中心', '统计报表'],
        },
        rules: ['必须引用已确认的 projectName', '模块名应可映射为页面集合'],
        failureCodes: ['INVALID_PARAMS', 'MODULE_PLAN_BUILD_FAILED'],
        fixHints: ['先调用 planning.createProjectPlan 并确认项目目标'],
      },
      execute: (args) => options.toolset.createModulePlan(args),
    },
    {
      name: 'planning.createPagePlan',
      description: '基于模块生成页面规划',
      parameters: pageSchema,
      registration: {
        category: 'planning',
        tags: ['page', 'decompose'],
        example: {
          moduleName: '员工申请',
          pageGoals: ['请假申请页', '申请记录页'],
        },
        rules: ['必须引用已存在模块', 'pageGoals 至少包含一个页面目标'],
        failureCodes: ['INVALID_PARAMS', 'PAGE_PLAN_BUILD_FAILED'],
        fixHints: ['补齐 moduleName', '将 pageGoals 规范为字符串数组'],
      },
      execute: (args) => options.toolset.createPagePlan(args),
    },
  ]

  if (options.toolset.validatePlan !== undefined) {
    tools.push({
      name: 'planning.validatePlan',
      description: '校验项目-模块-页面规划完整性',
      parameters: validateSchema,
      registration: {
        category: 'planning',
        tags: ['validate'],
        example: {
          plan: {
            project: { projectName: '企业请假系统' },
            modules: [{ moduleName: '员工申请' }],
            pages: [{ pageName: '请假申请页' }],
          },
        },
        rules: ['建议在 createProjectPlan/createModulePlan/createPagePlan 后执行'],
        failureCodes: ['INVALID_PARAMS', 'PLAN_VALIDATION_FAILED'],
        fixHints: ['检查 plan 对象是否包含 project/modules/pages 的基础结构'],
      },
      execute: (args) => options.toolset.validatePlan?.(args),
    })
  }

  return {
    id: options.id ?? 'planning.project-module-page',
    title: options.title ?? '项目-模块-页面规划',
    scope: 'planning',
    description: '把用户业务需求拆解为项目、模块、页面三层规划，并可注册校验工具完成闭合检查。',
    intents: options.intents ?? ['项目规划', '模块规划', '页面规划', '项目 模块 页面'],
    promptPolicy: {
      systemPrompt: options.systemPrompt ?? PLANNING_SCENARIO_SYSTEM_PROMPT,
      confirmPolicy: 'critical-confirm',
      recoveryPolicy: 'layered',
    },
    capabilities: [
      {
        id: 'planning.project',
        title: '生成项目级规划',
        kind: 'flow',
        description: '根据业务目标、约束和上下文生成项目层规划。',
        tags: ['planning', 'project'],
        relatedTools: ['planning.createProjectPlan'],
        requiredPayloadKeys: ['projectName', 'projectGoal'],
      },
      {
        id: 'planning.module',
        title: '生成模块拆解',
        kind: 'flow',
        description: '把项目目标拆成可实现的业务模块。',
        tags: ['planning', 'module'],
        relatedTools: ['planning.createModulePlan'],
        requiredPayloadKeys: ['projectName'],
      },
      {
        id: 'planning.page',
        title: '生成页面规划',
        kind: 'flow',
        description: '把模块进一步拆成页面目标与页面职责。',
        tags: ['planning', 'page'],
        relatedTools: ['planning.createPagePlan'],
        requiredPayloadKeys: ['moduleName'],
      },
      ...(options.toolset.validatePlan !== undefined
        ? [{
            id: 'planning.completion',
            title: '校验规划完整性',
            kind: 'completion' as const,
            description: '通过注册工具校验项目、模块、页面规划是否完整一致。',
            tags: ['planning', 'validate'],
            relatedTools: ['planning.validatePlan'],
          }]
        : []),
    ],
    payload: {
      description: '项目策划业务载荷。AI 应先从用户输入抽取字段，缺失关键字段时追问或调用注册工具补齐。',
      schema: planningPayloadSchema,
      required: ['userInput'],
      slots: [
        {
          key: 'userInput',
          label: '业务需求',
          description: '用户原始需求描述，是规划的最低输入。',
          required: true,
          source: 'user',
          ...(planningPayloadSchema.properties['userInput'] !== undefined ? { schema: planningPayloadSchema.properties['userInput'] } : {}),
        },
        {
          key: 'projectName',
          label: '项目名称',
          description: '生成项目规划时需要的项目名称。',
          required: false,
          source: 'user',
          ...(planningPayloadSchema.properties['projectName'] !== undefined ? { schema: planningPayloadSchema.properties['projectName'] } : {}),
          askWhenMissing: '这个系统/项目希望叫什么名字？',
        },
        {
          key: 'projectGoal',
          label: '项目目标',
          description: '生成项目规划时需要的目标说明。',
          required: false,
          source: 'user',
          ...(planningPayloadSchema.properties['projectGoal'] !== undefined ? { schema: planningPayloadSchema.properties['projectGoal'] } : {}),
          askWhenMissing: '这个项目最终要解决什么业务目标？',
        },
      ],
    },
    flow: {
      description: '项目策划注册流程：先形成项目目标，再拆模块，最后拆页面；校验工具存在时由工具闭合。',
      steps: [
        {
          id: 'project',
          title: '生成项目规划',
          kind: 'tool',
          tool: 'planning.createProjectPlan',
          requiredPayloadKeys: ['projectName', 'projectGoal'],
          critical: true,
        },
        {
          id: 'module',
          title: '生成模块规划',
          kind: 'tool',
          tool: 'planning.createModulePlan',
          dependsOn: ['project'],
          requiredPayloadKeys: ['projectName'],
          critical: true,
        },
        {
          id: 'page',
          title: '生成页面规划',
          kind: 'tool',
          tool: 'planning.createPagePlan',
          dependsOn: ['module'],
          requiredPayloadKeys: ['moduleName'],
          critical: true,
        },
        ...(options.toolset.validatePlan !== undefined
          ? [{ id: 'validate', title: '校验规划', kind: 'completion' as const, tool: 'planning.validatePlan', dependsOn: ['project', 'module', 'page'], critical: true }]
          : []),
      ],
    },
    completion: {
      description: '规划闭合由注册校验工具或上层业务验收完成，场景引擎不硬编码判断。',
      ...(options.toolset.validatePlan !== undefined ? { tools: ['planning.validatePlan'] } : {}),
      successSignals: ['项目规划存在', '模块规划存在', '页面规划存在', '关键约束已覆盖'],
      failureSignals: ['缺少项目目标', '模块无法映射到页面', '页面目标为空'],
    },
    recovery: [
      {
        code: 'INVALID_PARAMS',
        when: '工具参数缺少必填字段或类型不匹配',
        hint: '查询 payload 契约和工具 Schema，补齐 projectName/projectGoal/moduleName 等字段后重试。',
        tools: ['planning.createProjectPlan', 'planning.createModulePlan', 'planning.createPagePlan'],
      },
    ],
    tools,
    buildPayload: (ctx) => ({
      userInput: ctx.userInput,
      projectId: ctx.projectId,
      metadata: ctx.metadata ?? {},
    }),
    buildSteps: (payload) => [
      {
        id: 'project',
        title: '生成项目规划',
        tool: 'planning.createProjectPlan',
        args: payload,
      },
      {
        id: 'module',
        title: '生成模块规划',
        tool: 'planning.createModulePlan',
        args: payload,
      },
      {
        id: 'page',
        title: '生成页面规划',
        tool: 'planning.createPagePlan',
        args: payload,
      },
      ...(options.toolset.validatePlan !== undefined
        ? [{ id: 'validate', title: '校验规划', tool: 'planning.validatePlan', args: payload }]
        : []),
    ],
  }
}
