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
 *   2. 末段 ModuleKind.invokeAction(ctx, actionName, args) → 校验参数并执行业务
 *   3. 透传 OperationResult 给 LLM
 *
 * 【消费方】ModuleSemanticRuntime（工具路由 → invokeAction case）
 * ═══════════════════════════════════════════════════════════════
 */

import type { LlmJsonValue } from '../../schema'
import type { ModuleInvokeActionRequest, ModuleOperationResult } from '../protocol'
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
   *   - SCHEMA_VALIDATION_FAILED: 参数 schema 校验失败，checks 包含具体路径和原因
   *   - (其它):              由 navigator 或 ModuleKind.invokeAction 抛出
   */
  public async invoke(request: ModuleInvokeActionRequest): Promise<ModuleOperationResult<LlmJsonValue>> {
    const { path, actionName, args, host } = request
    // 步骤 1：路径导航 → 末段 ModuleKind + PathContext
    const navResult = await this.navigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }

    // 步骤 2 + 3：ModuleKind 统一负责动作声明、参数校验、委托执行和错误投影
    return navResult.moduleKind.invokeAction(navResult.segmentCtx, actionName, args)
  }
}
