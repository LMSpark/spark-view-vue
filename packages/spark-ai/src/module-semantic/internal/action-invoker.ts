/**
 * @packageDocumentation
 *
 * 动作调用器。
 *
 * 协议从 ModuleKind.actions 派生出 LLM 工具 invokeAction,调用时路由到这里。
 *
 * 流程:
 * 1. Navigator 解析路径,定位末段 ModuleKind + PathContext
 * 2. 用末段 kind 的 ModuleKind 查询动作元数据
 * 3. 用 LlmSchemaValidator 按 ActionSchema.paramsSchema 校验参数
 * 4. 委托末段 ModuleKind.invokeAction 执行业务
 * 5. 透传业务返回的 OperationResult 给 LLM
 */

import type { LlmJsonValue } from '../../schema'
import { LlmSchemaValidator } from '../../schema'
import type { ModuleHostContext } from '../protocol/module-kind'
import {
  type CheckEntry,
  errorCheck,
  type OperationResult,
} from '../protocol/operation-result'
import type { ModuleNavigationSuccess, Navigator } from './navigator'
import type { ModulePath } from '../protocol/module-path'

export class ActionInvoker {
  public constructor(
    private readonly navigator: Navigator,
  ) {}

  /**
   * 调用动作。
   *
   * 失败码:
   * - ACTION_NOT_DECLARED: 末段 ModuleKind 未声明此动作
   * - INVALID_ARGS:        参数 schema 校验失败,checks 包含具体路径和原因
   * - (其它):              由 navigator 或 ModuleKind 抛
   */
  public async invoke(
    path: ModulePath,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
    host?: ModuleHostContext,
  ): Promise<OperationResult<LlmJsonValue>> {
    const navResult = await this.navigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }

    const action = navResult.moduleKind.findAction(actionName)
    if (action === undefined) {
      return {
        ok: false,
        checks: [
          errorCheck(
            'ACTION_NOT_DECLARED',
            `kind "${navResult.segmentCtx.segment.kind}" 未声明动作 "${actionName}"`,
            '可调用 describeKind 查看该 kind 的动作表',
          ),
        ],
      }
    }

    const validation = LlmSchemaValidator.validateLlmDeserializedParams(args, action.paramsSchema)
    if (!validation.ok) {
      const checks: CheckEntry[] = validation.issues.map((issue) =>
        errorCheck('INVALID_ARGS', `${issue.path} ${issue.message}`),
      )
      const summary: CheckEntry = errorCheck(
        'INVALID_ARGS',
        LlmSchemaValidator.formatLlmParamValidationIssues(validation.issues),
        '请按 ModuleKind 上声明的 paramsSchema 调整参数后重试',
      )
      return { ok: false, checks: [summary, ...checks] }
    }

    return navResult.moduleKind.invokeAction(navResult.segmentCtx, actionName, args)
  }
}

function isNavigationSuccess(
  result: ModuleNavigationSuccess | OperationResult<never>,
): result is ModuleNavigationSuccess {
  return 'moduleKind' in result
}
