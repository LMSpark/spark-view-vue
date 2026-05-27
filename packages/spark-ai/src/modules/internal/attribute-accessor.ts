/**
 * ═══════════════════════════════════════════════════════════════
 * modules/internal/attribute-accessor.ts — 属性访问器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】协议层内部组件，由 AiModuleRuntime 组合。
 *   负责将 LLM 的 getAttribute / setAttribute 工具调用路由到具体 AiModule。
 *
 * 【调用时序】
 *   1. Navigator.navigate(path) → 定位末段 AiModule + PathContext
 *   2. 末段 AiModule.getAttribute(ctx, attrName) / setAttribute(ctx, attrName, value)
 *   3. AiModule 内部按 attributes 元数据验证声明、readable/writable 权限
 *   4. 透传 OperationResult 给 LLM
 *
 * 【消费方】AiModuleRuntime（工具路由 → getAttribute / setAttribute case）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonValue } from '../../json'
import type { AiModuleHostContext, AiModuleResult, AiModulePath, AiModuleSetAttributeRequest } from '../protocol'

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
   *   - ATTRIBUTE_NOT_DECLARED: 末段 AiModule 未声明此属性
   *   - ATTRIBUTE_NOT_READABLE: 属性声明为不可读
   *   - (其它): 由 navigator 或 AiModule.getAttribute 抛出
   */
  public async get(
    path: AiModulePath,
    attrName: string,
    host?: AiModuleHostContext,
  ): Promise<AiModuleResult<AiJsonValue>> {
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
  public async set(request: AiModuleSetAttributeRequest): Promise<AiModuleResult<void>> {
    const { path, attrName, value, host } = request
    const navResult = await this.navigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    return navResult.moduleKind.setAttribute(navResult.segmentCtx, attrName, value)
  }
}
