/**
 * @packageDocumentation
 *
 * 节点树模块语义协议 — ModuleKind 声明(参考实现)。
 *
 * 把 SparkNodeTree 的 19 个公开方法翻译成协议层 ActionSchema。
 * 与旧 NodeTreeModule 静态工具表完全等价(action.name 与 SparkNodeTreeMethodKey
 * 一一对应),但语义协议要求 LLM 通过固定的 invokeAction 工具调用,
 * action 名由 describeKind 暴露给 LLM。
 *
 * 设计要点:
 * - 仅声明结构(name / description / paramsSchema / usageRules / failureModes),
 *   不持有任何执行逻辑(执行下沉到 NodeTreeCapability)。
 * - paramsSchema / usageRules / failureModes / example 直接复用旧 NodeTreeModule
 *   注册项,避免双源维护。旧 catalog 的 functionId 与新 action.name 多数相同;
 *   仅 collectDataViewKeys ↔ collectDataKeys 一个别名,见 OLD_FUNCTION_ID_OF。
 * - attributes 留空:节点树本体不暴露可读写属性,所有状态改动走 actions。
 * - children 留空:节点树不再分层声明子模块。
 */

import {
  ModuleKindBase,
  type ActionSchema,
} from '@spark-view/spark-ai/module-semantic'
import type { AiFunctionRegistration } from '@spark-view/spark-ai/protocol'
import { NodeTreeModule } from '../modules/node-tree-tool-catalog'

/** SparkNodeTree 19 个公开方法键名(与 SparkNodeTreeMethodKey 联合类型一致)。 */
const NODE_TREE_METHOD_NAMES = [
  'getNode',
  'getLocation',
  'hasNode',
  'getParent',
  'listChildren',
  'countNodes',
  'getAllData',
  'collectDataViewKeys',
  'collectHandlerNames',
  'findByType',
  'addNode',
  'addNodes',
  'moveNode',
  'setProps',
  'setPropsBatch',
  'replaceNode',
  'replaceNodes',
  'removeNode',
  'removeNodes',
] as const

/**
 * 新 ModuleKind action 名 → 旧 NodeTreeModule functionId 的别名映射。
 *
 * 仅当两侧不同名时列入;其它名同步省略。
 *
 * 该映射的存在原因:旧 catalog 用 `collectDataKeys` 作为 LLM 看到的名字,
 * 但新协议直接对齐 SparkNodeTreeMethodKey,使用 `collectDataViewKeys`。
 * 不修改旧 catalog 以维护现状。
 */
const OLD_FUNCTION_ID_OF: ReadonlyMap<string, string> = new Map([
  ['collectDataViewKeys', 'collectDataKeys'],
])

const OLD_FUNCTION_REGISTRATIONS: ReadonlyMap<string, AiFunctionRegistration> = (() => {
  const module = new NodeTreeModule()
  return new Map(module.functionRegistrations.map((registration) => [registration.functionId, registration]))
})()

/**
 * 节点树模块的语义协议 Kind 声明。
 *
 * 协议层 describeKind 会让 LLM 看到所有 19 个 action 名 + 各自完整 paramsSchema /
 * usageRules / failureModes / example;具体调用经
 * invokeAction(actionName=getNode, args=...) 路由到 NodeTreeCapability。
 */
export class NodeTreeModuleKind extends ModuleKindBase {
  public constructor() {
    super({
      kind: 'node-tree',
      name: 'Page Design Node Tree',
      description: '当前页面 SparkNodeTree/rule.json 结构读写;通过 invokeAction 调用 19 个公开方法。',
      attributes: [],
      actions: NODE_TREE_METHOD_NAMES.map((methodName) => actionFor(methodName)),
      children: [],
    })
  }
}

function actionFor(methodName: typeof NODE_TREE_METHOD_NAMES[number]): ActionSchema {
  const oldId = OLD_FUNCTION_ID_OF.get(methodName) ?? methodName
  const registration = OLD_FUNCTION_REGISTRATIONS.get(oldId)
  if (registration === undefined) {
    throw new Error(
      `NodeTreeModuleKind missing legacy registration for ${methodName}/${oldId}`,
    )
  }
  return {
    name: methodName,
    description: registration.description,
    paramsSchema: registration.paramsSchema,
    ...(registration.resultSchema !== undefined ? { resultSchema: registration.resultSchema } : {}),
    ...(registration.usageRules !== undefined && registration.usageRules.length > 0
      ? { usageRules: registration.usageRules }
      : {}),
    ...(registration.failureModes !== undefined && registration.failureModes.length > 0
      ? { failureModes: registration.failureModes }
      : {}),
    ...(registration.example !== undefined ? { example: registration.example } : {}),
  }
}
