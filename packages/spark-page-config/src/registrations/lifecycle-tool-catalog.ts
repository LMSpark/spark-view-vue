/**
 * 页面设计生命周期工具模块。
 *
 * 提供三个函数：
 * - bootstrap — 引导编辑会话，校验 live binding 能力并进入 editing phase
 * - describeProgress — 查询当前编辑运行状态、可用性和下一步建议
 * - describeDesignFlow — 查询页面设计 100 步流程，支持阶段/步骤过滤
 */

import {
  noParamsSchema,
  numberSchema,
  paramsSchema,
  stringSchema,
  type LlmJsonValue,
} from '@spark-view/spark-ai/schema'
import { ModuleKind, type ActionSchema } from '@spark-view/spark-ai/module-semantic'
import type {
  PageDesignServiceContext,
} from '../capabilities/page-edit-session'
import type { PageDesignService } from '../capabilities/page-design-service'
import { createCurrentPageRef } from './page-design-helpers'
import { summarizePageDesignFlowPhases } from '../capabilities/page-design-artifacts'

const PAGE_DESIGN_FLOW_PHASES = summarizePageDesignFlowPhases()

function formatPageDesignFlowPhases(): string {
  return PAGE_DESIGN_FLOW_PHASES
    .map((phase) => `${phase.phase}(${phase.firstStep}-${phase.lastStep})`)
    .join(' -> ')
}

export const PAGE_DESIGN_FLOW_PROMPT = `【页面设计 100 步流程】
- 页面设计流程真源来自 spark-page-config/capabilities/design/page-design-100-step-flow。
- 阶段顺序：${formatPageDesignFlowPhases()}。
- 复杂修改开始前先调用 lifecycle.describeDesignFlow({}) 或按 phase / step / afterStep 查询当前位置。
- 不要在 prompt 中重新发明流程；以 lifecycle.describeDesignFlow 返回的 phases / steps / nextStep 为准。`

const NO_PARAMS = noParamsSchema('bootstrap / describeProgress 不接收文件快照参数，请传 {} 或留空。')
const DESIGN_FLOW_PARAMS = paramsSchema({
  phase: stringSchema('可选。按阶段名筛选页面设计 100 步，例如 数据规划、数据利用、结构、行为。'),
  step: numberSchema('可选。查询指定步骤编号，范围 1-100。'),
  afterStep: numberSchema('可选。返回指定已完成步骤之后的下一步。'),
})

const BOOTSTRAP_RULE = 'bootstrap 仅做 live binding 可用性校验，不接收文件快照参数。'
const PHASE_RULE = '执行成功后进入 editing phase。'
const DESIGN_FLOW_READONLY_RULE = '只返回页面设计 100 步流程事实，不修改页面内容。'

const LIFECYCLE_ACTIONS: readonly ActionSchema[] = [
  {
    name: 'bootstrap',
    description: '引导编辑会话：校验 live binding 能力并进入 editing phase。',
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
      '当不确定当前编辑是否已完成 bootstrap，或需要确认可读写能力时调用。',
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
    },
    example: {
      phase: '数据利用',
      afterStep: 70,
    },
    usageRules: [
      '开始复杂页面设计前调用一次，明确当前应按哪一阶段推进。',
      '需要恢复上下文时传 step 或 afterStep 查询精确下一步。',
      DESIGN_FLOW_READONLY_RULE,
    ],
    failureModes: [],
  },
]

export class PageDesignLifecycleModuleKind extends ModuleKind {
  private readonly service: PageDesignService
  private readonly contextFactory: (ctx: ModuleKind.PathContext) => PageDesignServiceContext

  public constructor(options: {
    readonly service: PageDesignService
    readonly contextFactory: (ctx: ModuleKind.PathContext) => PageDesignServiceContext
  }) {
    super({
      kind: 'lifecycle',
      name: 'Page Design Lifecycle',
      description: '页面设计编辑运行态引导与进度查询。',
      actions: LIFECYCLE_ACTIONS,
      children: [],
    })
    this.service = options.service
    this.contextFactory = options.contextFactory
  }

  public override invokeAction(
    ctx: ModuleKind.PathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    if (this.findAction(actionName) === undefined) {
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

  protected override createCurrentInstanceRef(ctx: ModuleKind.PathContext): ModuleKind.InstanceRef | null {
    return createCurrentPageRef(ctx, '当前页面生命周期')
  }
}

function toDesignFlowQuery(args: Readonly<Record<string, LlmJsonValue>>): { phase?: string; step?: number; afterStep?: number } {
  return {
    ...(typeof args['phase'] === 'string' ? { phase: args['phase'] } : {}),
    ...(typeof args['step'] === 'number' ? { step: args['step'] } : {}),
    ...(typeof args['afterStep'] === 'number' ? { afterStep: args['afterStep'] } : {}),
  }
}
