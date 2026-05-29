/**
 * 页面设计生命周期与流程控制工具模块。
 *
 * ## 在 PageDesign 流程中的位置
 * ```
 * Host 启动 pageDesign 会话
 *   → lifecycle.bootstrap()          [自动] 校验 live binding（nodeTree / dataset / text-model 是否就绪）
 *   → lifecycle.describeProgress()   [首轮] 查询当前编辑阶段、binding 可用性、下一步建议
 *   → lifecycle.describeDesignFlow() [首轮] 查询 100 步流程，按 intent 返回匹配的任务知识
 *   → dataset / node-tree / text-model  按流程阶段执行实际编辑
 *   → lifecycle.describeProgress()   [循环] 不确定状态时复查
 * ```
 *
 * ## 三个动作的职责
 * - `bootstrap` — 只做 live binding 校验，不写四文件。Host 启动时自动调用，
 *   LLM 常规流程不得主动调用，除非工具结果明确要求重新校验。
 * - `describeProgress` — 只读编辑运行状态，返回 phase / bindings / nextStep。
 * - `describeDesignFlow` — 只读 100 步流程事实与任务知识；
 *   支持 phase/step/afterStep/intent 四种过滤维度。
 *
 * ## 设计原则
 * 本模块是"流程知识源"——LLM 通过它知道当前在第几步、下一步该做什么。
 * 四文件的实际写入必须经 dataset、node-tree 或 text-model 子模块，
 * lifecycle 自身不持有任何写入能力。
 */

import {
  noParamsSchema,
  enumSchema,
  numberSchema,
  paramsSchema,
  stringSchema,
  type AiJsonValue,
} from '@spark-view/spark-ai/json'
import {
  AiModule,
  type AiModuleFunctionMetadata,
  type AiModuleInstanceRef,
  type AiModuleResult,
  type AiModulePathContext,
} from '@spark-view/spark-ai/modules'
import type {
  PageDesignServiceContext,
} from '../design/page-edit-session'
import type { PageDesignService } from '../design/page-design-service'
import { createCurrentPageRef, findCurrentPageInstance } from './page-design-helpers'

// ── 参数 schema 与使用规则 ────────────────────────────────

// PAGE_DESIGN_AI_TRACE[page-design-lifecycle]: pageDesign AI 的 bootstrap/progress/100-step 流程出处；只负责编辑态与流程事实，不直接写四文件。
const NO_PARAMS = noParamsSchema('bootstrap / describeProgress 不接收文件快照参数，请传 {} 或留空。')
const DESIGN_FLOW_PARAMS = paramsSchema({
  phase: enumSchema([
    '入口',
    '盘点',
    '数据规划',
    '最小表模型',
    '表关系',
    '页面规划',
    '数据利用',
    '按需视图',
    '视图依赖',
    '结构',
    '行为',
    '样式',
    '交叉校验',
    '预览修正',
    '收尾',
  ], '可选。必须使用 describeDesignFlow 返回的中文 phase 名；例如 页面规划、数据利用、结构、行为。'),
  step: numberSchema('可选。查询指定步骤编号，范围 1-100。'),
  afterStep: numberSchema('可选。返回指定已完成步骤之后的下一步。'),
  intent: stringSchema('可选。用户原始意图；用于返回匹配的任务知识 guide，例如申请表单闭环。'),
}, [], '页面设计 100 步流程查询参数。所有字段均为可选。')

const BOOTSTRAP_RULE = 'Host 会话启动时已自动执行 bootstrap；LLM 常规页面设计流程不得主动调用，除非工具结果明确要求重新校验 live binding。'
const PHASE_RULE = '执行成功后进入 editing phase。'
const DESIGN_FLOW_READONLY_RULE = '只返回页面设计 100 步流程事实，不修改页面内容。'

// ── lifecycle 动作声明 ────────────────────────────────────

const LIFECYCLE_ACTIONS: readonly AiModuleFunctionMetadata[] = [
  {
    name: 'bootstrap',
    description: 'Host 启动会话时自动执行的引导动作：校验 live binding 能力并进入 editing phase。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      phase: '"editing" — 会话阶段切换结果',
    },
    example: {},
    usageRules: [BOOTSTRAP_RULE, PHASE_RULE],
    failureModes: [
      {
        code: 'NO_NODE_TREE',
        when: '缺少 PageDesignEditHost.getNodeTree 或返回 null',
        fix: '宿主注入可用的 nodeTree tool 实例。',
      },
      {
        code: 'NO_DATASET_EDIT',
        when: '缺少 PageDesignEditHost.getDataSetTool 或返回 null',
        fix: '宿主注入可用的 dataset tool 实例。',
      },
      {
        code: 'NO_TEXT_MODEL',
        when: '缺少 script/style 的读取器入口',
        fix: '宿主注入 PageDesignEditHost.readScript/readStyle。',
      },
    ],
  },
  {
    name: 'describeProgress',
    description: '查询当前 pageDesign 编辑运行状态、live binding 可用性和下一步建议。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      phase: 'PageDesignEditPhase — 当前编辑阶段',
      bindings: 'Record<string, boolean> — live binding 可用性',
      nextStep: 'string — 下一步建议',
    },
    example: {},
    usageRules: [
      '当不确定当前编辑状态或需要确认可读写能力时调用本只读动作；不要为了启动会话去调用 bootstrap。',
      '本函数只读业务运行状态，不修改页面内容。',
    ],
    failureModes: [],
  },
  {
    name: 'describeDesignFlow',
    description: '查询页面设计 100 步流程，可返回阶段汇总、指定步骤、阶段步骤列表和下一步。',
    paramsSchema: DESIGN_FLOW_PARAMS,
    resultSchema: {
      phases: 'PageDesignFlowPhaseSummary[] — 阶段汇总，包含 firstStep / lastStep / stepCount',
      steps: 'PageDesignFlowStep[] — 按 phase 或 step 过滤后的步骤列表',
      selectedStep: 'PageDesignFlowStep | null — step 命中的单个步骤',
      nextStep: 'PageDesignFlowStep | null — afterStep 或 selectedStep 之后的下一步',
      taskGuides: 'PageDesignTaskGuide[] — 按 intent 匹配的任务知识；LLM 应先查询再按该知识发 FC，不要从 system prompt 猜模板',
    },
    example: {
      intent: '实现申请表单页面设计',
      phase: '数据规划',
    },
    usageRules: [
      '开始复杂页面设计前调用一次，明确当前应按哪一阶段推进；传 intent 时只返回命中任务 guide 和相关步骤，不返回全量 100 步。',
      '不传 phase/step/intent 时只用于查看阶段摘要；需要细节时按 phase、step 或 intent 继续查询。',
      '需要恢复上下文时传 step 或 afterStep 查询精确下一步。',
      DESIGN_FLOW_READONLY_RULE,
    ],
    failureModes: [],
  },
]

// ── lifecycle AiModule ──────────────────────────────────

/**
 * pageDesign 生命周期与流程知识子模块。
 *
 * `bootstrap` 只做 live binding 校验，`describeProgress` 只读编辑态，
 * `describeDesignFlow` 只返回流程/任务知识；四文件写入必须经 dataset、
 * node-tree 或 text-model 子模块。
 */
export class PageDesignLifecycleAiModule extends AiModule {
  private readonly service: PageDesignService
  private readonly contextFactory: (ctx: AiModulePathContext) => PageDesignServiceContext

  public constructor(options: {
    readonly service: PageDesignService
    readonly contextFactory: (ctx: AiModulePathContext) => PageDesignServiceContext
    readonly parentKind?: string
  }) {
    super({
      kind: 'lifecycle',
      name: 'Page Design Lifecycle',
      description: '页面设计编辑运行态引导与进度查询。',
      ...(options.parentKind === undefined ? {} : { parentKind: options.parentKind }),
      functions: LIFECYCLE_ACTIONS,
      children: [],
      find: (ctx, childKind, query) => findCurrentPageInstance({ ctx, childKind, query, ownKind: 'lifecycle', label: '当前页面生命周期' }),
    })
    this.service = options.service
    this.contextFactory = options.contextFactory
  }

  protected override runFunction(
    ctx: AiModulePathContext,
    actionName: string,
    args: Readonly<Record<string, AiJsonValue>>,
  ): Promise<AiModuleResult<AiJsonValue>> {
    if (this.findFunction(actionName) === undefined) {
      throw new Error(`${this.kind} action is not declared: ${actionName}`)
    }
    switch (actionName) {
      case 'bootstrap':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.bootstrap(this.contextFactory(ctx))))
      case 'describeProgress':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.describeProgress(this.contextFactory(ctx))))
      case 'describeDesignFlow':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.describeDesignFlow(this.contextFactory(ctx), toDesignFlowQuery(args))))
      default:
        throw new Error(`${this.kind} action runner is not registered: ${actionName}`)
    }
  }

  protected override createCurrentInstanceRef(ctx: AiModulePathContext): AiModuleInstanceRef | null {
    return createCurrentPageRef(ctx, '当前页面生命周期')
  }
}

// ── 参数归一化 ────────────────────────────────────────────

function toDesignFlowQuery(args: Readonly<Record<string, AiJsonValue>>): { phase?: string; step?: number; afterStep?: number; intent?: string } {
  return {
    ...(typeof args['phase'] === 'string' ? { phase: args['phase'] } : {}),
    ...(typeof args['step'] === 'number' ? { step: args['step'] } : {}),
    ...(typeof args['afterStep'] === 'number' ? { afterStep: args['afterStep'] } : {}),
    ...(typeof args['intent'] === 'string' ? { intent: args['intent'] } : {}),
  }
}
