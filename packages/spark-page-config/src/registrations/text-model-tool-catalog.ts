/**
 * 页面设计文本模型工具模块。
 *
 * 提供四个函数：readScript / writeScript / readStyle / writeStyle
 * 用于读写当前页面的 script.js 和 style.css 文本模型内容。
 * 调用前必须先完成 lifecycle.bootstrap，确保宿主已绑定 readScript/readStyle/writeScript/writeStyle 能力。
 * 写入为全量覆盖，不支持 patch。
 */

import {
  noParamsSchema,
  paramsSchema,
  stringSchema,
  type LlmJsonValue,
} from '@spark-view/spark-ai/schema'
import { ModuleKind, type ActionSchema } from '@spark-view/spark-ai/module-semantic'
import type {
  PageDesignService,
  PageDesignServiceContext,
} from '../capabilities/page-edit-session'
import { createCurrentPageRef } from './page-design-helpers'

const NO_PARAMS = noParamsSchema('readScript / readStyle 不接受参数，请传 {} 或留空。')
const CONTENT_SCHEMA = stringSchema('完整文本内容（全量覆盖写入，不支持 patch）')

const BOOTSTRAP_RULE = `调用 text-model action 前必须先完成 lifecycle.bootstrap，确保宿主绑定 read*/write*。`
const FULL_WRITE_RULE = 'write 动作要求 content 为完整文本模型内容，调用后覆盖原内容。'
const SCRIPT_RUNTIME_RULE = 'writeScript 需遵守 script 运行时 API 合同，禁止使用不可用伪 API。'

const TEXT_MODEL_ACTIONS: readonly ActionSchema[] = [
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
        fix: '先执行 lifecycle.bootstrap 并确保宿主提供 readScript。',
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
    usageRules: [BOOTSTRAP_RULE, FULL_WRITE_RULE, SCRIPT_RUNTIME_RULE],
    failureModes: [
      {
        code: 'NO_TEXT_MODEL',
        when: '宿主未绑定 PageDesignEditHost.writeScript',
        fix: '先执行 lifecycle.bootstrap 并确保宿主提供 writeScript。',
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
        fix: '先执行 lifecycle.bootstrap 并确保宿主提供 readStyle。',
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
        fix: '先执行 lifecycle.bootstrap 并确保宿主提供 writeStyle。',
      },
    ],
  },
]

export class PageDesignTextModelModuleKind extends ModuleKind {
  private readonly service: PageDesignService
  private readonly contextFactory: (ctx: ModuleKind.PathContext) => PageDesignServiceContext

  public constructor(options: {
    readonly service: PageDesignService
    readonly contextFactory: (ctx: ModuleKind.PathContext) => PageDesignServiceContext
  }) {
    super({
      kind: 'text-model',
      name: 'Page Design Text Model',
      description: '当前页面 script.js/style.css live 文本模型读写。',
      actions: TEXT_MODEL_ACTIONS,
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

  protected override createCurrentInstanceRef(ctx: ModuleKind.PathContext): ModuleKind.InstanceRef | null {
    return createCurrentPageRef(ctx, '当前页面文本模型')
  }
}

function readRequiredStringArg(args: Readonly<Record<string, LlmJsonValue>>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') {
    throw new Error(`Missing required string argument: ${key}`)
  }
  return value
}
