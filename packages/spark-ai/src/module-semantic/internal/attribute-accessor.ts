/**
 * @packageDocumentation
 *
 * 属性访问器。
 *
 * 协议从 ModuleKind.attributes 派生出 LLM 工具 getAttribute / setAttribute,
 * 调用时路由到这里。本类负责:
 *
 * 1. 调用 Navigator 把路径翻译成末段 ModuleKind + PathContext
 * 2. 委托末段 ModuleKind 按 attributes 元数据验证是否声明、是否 readable/writable
 * 3. 委托末段 ModuleKind.getAttribute / setAttribute 执行业务读写
 * 4. 透传业务返回的 OperationResult 给 LLM
 */

import type { LlmJsonValue } from '../../schema'
import type { ModuleHostContext } from '../protocol/module-kind'
import type { OperationResult } from '../protocol/operation-result'
import type { ModuleNavigationSuccess, Navigator } from './navigator'
import type { ModulePath } from '../protocol/module-path'

export class AttributeAccessor {
  public constructor(
    private readonly navigator: Navigator,
  ) {}

  /**
   * 读属性。
   *
   * 失败码:
   * - ATTRIBUTE_NOT_DECLARED: 末段 ModuleKind 未声明此属性
   * - ATTRIBUTE_NOT_READABLE: 属性声明为不可读
   * - (其它):由 navigator 或 ModuleKind 抛
   */
  public async get(path: ModulePath, attrName: string, host?: ModuleHostContext): Promise<OperationResult<LlmJsonValue>> {
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
   * - ATTRIBUTE_NOT_DECLARED
   * - ATTRIBUTE_NOT_WRITABLE
   */
  public async set(path: ModulePath, attrName: string, value: LlmJsonValue, host?: ModuleHostContext): Promise<OperationResult<void>> {
    const navResult = await this.navigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    return navResult.moduleKind.setAttribute(navResult.segmentCtx, attrName, value)
  }
}

function isNavigationSuccess(
  result: ModuleNavigationSuccess | OperationResult<never>,
): result is ModuleNavigationSuccess {
  return 'moduleKind' in result
}
