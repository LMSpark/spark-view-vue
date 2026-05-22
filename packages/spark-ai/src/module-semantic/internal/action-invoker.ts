/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/internal/action-invoker.ts — 动作调用器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】协议层内部组件，由 ModuleSemanticRuntime 组合。
 *   负责将 LLM 的 invokeAction 工具调用路由到具体 ModuleKind 的动作执行。
 *
 * 【调用时序】
 *   1. Navigator.navigate(path) → 定位末段 ModuleKind + PathContext
 *   2. 末段 ModuleKind.findAction(actionName) → 查询动作元数据
 *   3. LlmSchemaValidator.validateLlmDeserializedParams(args, action.paramsSchema) → 参数校验
 *   4. 末段 ModuleKind.invokeAction(ctx, actionName, args) → 执行业务
 *   5. 透传 OperationResult 给 LLM
 *
 * 【消费方】ModuleSemanticRuntime（工具路由 → invokeAction case）
 * ═══════════════════════════════════════════════════════════════
 */

import type { LlmJsonValue } from '../../schema'
import { LlmSchemaValidator } from '../../schema'
import { ModuleKind } from '../protocol/module-kind'
import type { Navigator } from './navigator'
import { isNavigationSuccess } from './navigator'

export class ActionInvoker {
  public constructor(
    private readonly navigator: Navigator,
  ) {}

  /**
   * 调用动作。
   *
   * 失败码:
   *   - ACTION_NOT_DECLARED: 末段 ModuleKind 未声明此动作
   *   - INVALID_ARGS:        参数 schema 校验失败，checks 包含具体路径和原因
   *   - (其它):              由 navigator 或 ModuleKind.invokeAction 抛出
   */
  public async invoke(
    path: ModuleKind.Path,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
    host?: ModuleKind.HostContext,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    // 步骤 1：路径导航 → 末段 ModuleKind + PathContext
    const navResult = await this.navigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }

    // 步骤 2：查询动作元数据
    const action = navResult.moduleKind.findAction(actionName)
    if (action === undefined) {
      return ModuleKind.OperationResult.failCode(
        'ACTION_NOT_DECLARED',
        `kind "${navResult.segmentCtx.segment.kind}" 未声明动作 "${actionName}"`,
        '可调用 describeKind 查看该 kind 的动作表',
      )
    }

    // 步骤 3：按 paramsSchema 校验参数
    const validation = LlmSchemaValidator.validateLlmDeserializedParams(args, action.paramsSchema)
    if (!validation.ok) {
      const checks: ModuleKind.CheckEntry[] = validation.issues.map((issue) =>
        ModuleKind.CheckEntry.error('INVALID_ARGS', `${issue.path} ${issue.message}`),
      )
      const summary: ModuleKind.CheckEntry = ModuleKind.CheckEntry.error(
        'INVALID_ARGS',
        LlmSchemaValidator.formatLlmParamValidationIssues(validation.issues),
        '请按 ModuleKind 上声明的 paramsSchema 调整参数后重试',
      )
      return ModuleKind.OperationResult.fail([summary, ...checks])
    }

    // 步骤 4 + 5：委托执行 + 透传结果
    return navResult.moduleKind.invokeAction(navResult.segmentCtx, actionName, args)
  }
}
