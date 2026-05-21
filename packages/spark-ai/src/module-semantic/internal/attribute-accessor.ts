/**
 * @packageDocumentation
 *
 * 属性访问器。
 *
 * 协议从 ModuleKind.attributes 派生出 LLM 工具 getAttribute / setAttribute,
 * 调用时路由到这里。本类负责:
 *
 * 1. 调用 ModuleNavigator 把路径翻译成末段 Capability + PathContext
 * 2. 用末段 kind 的 ModuleKind 验证属性是否声明、是否 readable/writable
 * 3. 委托末段 Capability.getAttribute / setAttribute 执行业务读写
 * 4. 透传业务返回的 OperationResult 给 LLM
 *
 * 协议事前校验仅限"是否声明、是否允许":值类型校验由 Capability 自行做,
 * 因为属性 schema 的语义对值的解释权在业务方。
 */

import type { LlmJsonValue } from '../../protocol/parameter-schema'
import type { AttributeSchema } from '../protocol/module-kind'
import {
  errorCheck,
  type OperationResult,
} from '../protocol/operation-result'
import type { ModuleKindRegistry } from './module-kind-registry'
import type { ModuleNavigator, ModuleNavigationSuccess } from './module-navigator'
import type { ModulePath } from '../protocol/module-path'

export class AttributeAccessor {
  public constructor(
    private readonly kinds: ModuleKindRegistry,
    private readonly navigator: ModuleNavigator,
  ) {}

  /**
   * 读属性。
   *
   * 失败码:
   * - ATTRIBUTE_NOT_DECLARED: 末段 ModuleKind 未声明此属性
   * - ATTRIBUTE_NOT_READABLE: 属性声明为不可读
   * - (其它):由 navigator 或 Capability 抛
   */
  public async get(path: ModulePath, attrName: string): Promise<OperationResult<LlmJsonValue>> {
    const navResult = await this.navigator.navigate(path)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    const attr = this.findAttribute(navResult, attrName)
    if (attr === undefined) {
      return {
        ok: false,
        checks: [
          errorCheck(
            'ATTRIBUTE_NOT_DECLARED',
            `kind "${navResult.segmentCtx.segment.kind}" 未声明属性 "${attrName}"`,
            '可调用 describeKind 查看该 kind 的属性表',
          ),
        ],
      }
    }
    if (!attr.readable) {
      return {
        ok: false,
        checks: [
          errorCheck(
            'ATTRIBUTE_NOT_READABLE',
            `属性 "${attrName}" 在 kind "${navResult.segmentCtx.segment.kind}" 上不可读`,
          ),
        ],
      }
    }
    return navResult.capability.getAttribute(navResult.segmentCtx, attrName)
  }

  /**
   * 写属性。
   *
   * 失败码:
   * - ATTRIBUTE_NOT_DECLARED
   * - ATTRIBUTE_NOT_WRITABLE
   */
  public async set(path: ModulePath, attrName: string, value: LlmJsonValue): Promise<OperationResult<void>> {
    const navResult = await this.navigator.navigate(path)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    const attr = this.findAttribute(navResult, attrName)
    if (attr === undefined) {
      return {
        ok: false,
        checks: [
          errorCheck(
            'ATTRIBUTE_NOT_DECLARED',
            `kind "${navResult.segmentCtx.segment.kind}" 未声明属性 "${attrName}"`,
            '可调用 describeKind 查看该 kind 的属性表',
          ),
        ],
      }
    }
    if (!attr.writable) {
      return {
        ok: false,
        checks: [
          errorCheck(
            'ATTRIBUTE_NOT_WRITABLE',
            `属性 "${attrName}" 在 kind "${navResult.segmentCtx.segment.kind}" 上不可写`,
          ),
        ],
      }
    }
    return navResult.capability.setAttribute(navResult.segmentCtx, attrName, value)
  }

  private findAttribute(navResult: ModuleNavigationSuccess, attrName: string): AttributeSchema | undefined {
    const kind = this.kinds.require(navResult.segmentCtx.segment.kind)
    return kind.attributes.find((attr) => attr.name === attrName)
  }
}

function isNavigationSuccess(
  result: ModuleNavigationSuccess | OperationResult<never>,
): result is ModuleNavigationSuccess {
  return 'capability' in result
}
