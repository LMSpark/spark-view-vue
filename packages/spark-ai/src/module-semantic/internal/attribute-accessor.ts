/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/internal/attribute-accessor.ts — 属性访问器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】协议层内部组件，由 ModuleSemanticRuntime 组合。
 *   负责将 LLM 的 getAttribute / setAttribute 工具调用路由到具体 ModuleKind。
 *
 * 【调用时序】
 *   1. Navigator.navigate(path) → 定位末段 ModuleKind + PathContext
 *   2. 末段 ModuleKind.getAttribute(ctx, attrName) / setAttribute(ctx, attrName, value)
 *   3. ModuleKind 内部按 attributes 元数据验证声明、readable/writable 权限
 *   4. 透传 OperationResult 给 LLM
 *
 * 【消费方】ModuleSemanticRuntime（工具路由 → getAttribute / setAttribute case）
 * ═══════════════════════════════════════════════════════════════
 */

import type { LlmJsonValue } from '../../schema'
import type { ModuleHostContext, ModuleOperationResult, ModulePath } from '../protocol'
import type { ModuleSetAttributeRequest } from '../protocol/module-context'

import type { Navigator } from './navigator'
import { isNavigationSuccess } from './navigator'


export class AttributeAccessor {
  public constructor(
    private readonly navigator: Navigator,
  ) {}

  /**
   * 读属性。
   *
   * 失败码:
   *   - ATTRIBUTE_NOT_DECLARED: 末段 ModuleKind 未声明此属性
   *   - ATTRIBUTE_NOT_READABLE: 属性声明为不可读
   *   - (其它): 由 navigator 或 ModuleKind.getAttribute 抛出
   */
  public async get(
    path: ModulePath,
    attrName: string,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const navResult = await this.navigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    return navResult.moduleKind.getAttribute(navResult.segmentCtx, attrName)
  }

  /**
   * 写属性。
   *
   * 失败码:
   *   - ATTRIBUTE_NOT_DECLARED
   *   - ATTRIBUTE_NOT_WRITABLE
   */
  public async set(request: ModuleSetAttributeRequest): Promise<ModuleOperationResult<void>> {
    const { path, attrName, value, host } = request
    const navResult = await this.navigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    return navResult.moduleKind.setAttribute(navResult.segmentCtx, attrName, value)
  }
}
