/**
 * 页面设计文本模型工具模块（script.js / style.css 读写）。
 *
 * ## 在 PageDesign 流程中的位置
 * text-model 是四文件编辑的最后一环——按 dataset → node-tree → text-model 顺序，
 * 只有在数据表和页面结构就位后，才进入脚本和样式的写入阶段。
 * 对应 100 步流程的步骤 93-96（行为与样式）。
 *
 * ## 四个动作
 * - `readScript` / `readStyle` — 读取当前全文，无参数
 * - `writeScript` / `writeStyle` — 全量覆盖写入（不支持 patch）
 *
 * ## writeScript 的前置校验
 * 写入前会通过 `validateScriptServiceContract` 检查脚本内容是否使用了
 * 运行时不可用的伪 API（如 $page.getDataSet、$page.setFieldValue 等），
 * 以及函数签名是否超过 3 个位置参数。命中任一规则则拒绝写入并返回修复指引。
 *
 * ## 运行时 API 合同
 * - 数据入口：$dataSet（DataView / CRUD）
 * - 组件入口：$components.getApi("component-id")
 * - 页面服务：$page.showMessage / showConfirm / navigate 等（仅限白名单能力）
 * - 禁止的伪 API 列表见 FORBIDDEN_SCRIPT_API_RULES
 */

import {
  noParamsSchema,
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

const NO_PARAMS = noParamsSchema('readScript / readStyle 不接受参数，请传 {} 或留空。')
const CONTENT_SCHEMA = stringSchema('完整文本内容（全量覆盖写入，不支持 patch）')

const BOOTSTRAP_RULE = 'Host 会话启动已自动完成 lifecycle.bootstrap；text-model action 可直接使用当前 live binding，不要把 bootstrap 当成常规前置步骤重复调用。'
const FULL_WRITE_RULE = 'write 动作要求 content 为完整文本模型内容，调用后覆盖原内容。'
const SCRIPT_RUNTIME_RULE = 'writeScript 需遵守 script 运行时 API 合同，禁止使用不可用伪 API。'
const SCRIPT_SHORT_SIGNATURE_RULE = 'writeScript 中的函数/handler 默认最多 3 个位置参数；4 个及以上必须改为 options 对象，或在函数体内通过 $dataSet/$query/$components 读取上下文。'

// PAGE_DESIGN_AI_TRACE[page-design-text-model]: pageDesign AI 写 script.js/style.css 的唯一工具目录；清理冗余时不要和 workspace 保存逻辑混在一起。
// PAGE_DESIGN_REFACTOR_SOURCE[text-model-write-gate]: script/style AI 写入入口；不要把文本覆盖、脚本 API 校验和 workspace 持久化混成一层。
const TEXT_MODEL_ACTIONS: readonly AiModuleFunctionMetadata[] = [
  {
    name: 'readScript',
    description: '读取 script.js 当前完整文本模型内容。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      content: 'string — script.js 当前全文',
    },
    example: {},
    usageRules: [BOOTSTRAP_RULE],
    failureModes: [
      {
        code: 'NO_TEXT_MODEL',
        when: '宿主未绑定 PageDesignEditHost.readScript',
        fix: '检查 Host 启动和宿主绑定，确保当前 pageDesign 会话提供 readScript。',
      },
    ],
  },
  {
    name: 'writeScript',
    description: '覆盖写入 script.js 全量文本模型内容。',
    paramsSchema: paramsSchema({ content: CONTENT_SCHEMA }, ['content']),
    resultSchema: {
      ok: 'boolean — 写入成功返回 true',
    },
    example: {
      content: 'export default {}',
    },
    usageRules: [BOOTSTRAP_RULE, FULL_WRITE_RULE, SCRIPT_RUNTIME_RULE, SCRIPT_SHORT_SIGNATURE_RULE],
    failureModes: [
      {
        code: 'NO_TEXT_MODEL',
        when: '宿主未绑定 PageDesignEditHost.writeScript',
        fix: '检查 Host 启动和宿主绑定，确保当前 pageDesign 会话提供 writeScript。',
      },
      {
        code: 'INVALID_SCRIPT_RUNTIME_API',
        when: 'script.js 使用了运行时不支持的伪 API',
        fix: '改用 $page/$dataSet/$components.getApi 的受支持能力。',
      },
    ],
  },
  {
    name: 'readStyle',
    description: '读取 style.css 当前完整文本模型内容。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      content: 'string — style.css 当前全文',
    },
    example: {},
    usageRules: [BOOTSTRAP_RULE],
    failureModes: [
      {
        code: 'NO_TEXT_MODEL',
        when: '宿主未绑定 PageDesignEditHost.readStyle',
        fix: '检查 Host 启动和宿主绑定，确保当前 pageDesign 会话提供 readStyle。',
      },
    ],
  },
  {
    name: 'writeStyle',
    description: '覆盖写入 style.css 全量文本模型内容。',
    paramsSchema: paramsSchema({ content: CONTENT_SCHEMA }, ['content']),
    resultSchema: {
      ok: 'boolean — 写入成功返回 true',
    },
    example: {
      content: '.page { padding: 12px; }',
    },
    usageRules: [BOOTSTRAP_RULE, FULL_WRITE_RULE],
    failureModes: [
      {
        code: 'NO_TEXT_MODEL',
        when: '宿主未绑定 PageDesignEditHost.writeStyle',
        fix: '检查 Host 启动和宿主绑定，确保当前 pageDesign 会话提供 writeStyle。',
      },
    ],
  },
]

export class PageDesignTextModelAiModule extends AiModule {
  private readonly service: PageDesignService
  private readonly contextFactory: (ctx: AiModulePathContext) => PageDesignServiceContext

  public constructor(options: {
    readonly service: PageDesignService
    readonly contextFactory: (ctx: AiModulePathContext) => PageDesignServiceContext
    readonly parentKind?: string
  }) {
    super({
      kind: 'text-model',
      name: 'Page Design Text Model',
      description: '当前页面 script.js/style.css live 文本模型读写。',
      ...(options.parentKind === undefined ? {} : { parentKind: options.parentKind }),
      functions: TEXT_MODEL_ACTIONS,
      children: [],
      find: (ctx, childKind, query) => findCurrentPageInstance({ ctx, childKind, query, ownKind: 'text-model', label: '当前页面文本模型' }),
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
    const context = this.contextFactory(ctx)
    switch (actionName) {
      case 'readScript':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.readTextModel(context, 'script')))
      case 'writeScript':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.writeTextModel(context, 'script', readRequiredStringArg(args, 'content'))))
      case 'readStyle':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.readTextModel(context, 'style')))
      case 'writeStyle':
        return Promise.resolve(this.serviceResultToOperationResult(this.service.writeTextModel(context, 'style', readRequiredStringArg(args, 'content'))))
      default:
        throw new Error(`${this.kind} action runner is not registered: ${actionName}`)
    }
  }

  protected override createCurrentInstanceRef(ctx: AiModulePathContext): AiModuleInstanceRef | null {
    return createCurrentPageRef(ctx, '当前页面文本模型')
  }
}

function readRequiredStringArg(args: Readonly<Record<string, AiJsonValue>>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') {
    throw new Error(`Missing required string argument: ${key}`)
  }
  return value
}
