/**
 * @packageDocumentation
 *
 * 节点树模块语义协议 — ModuleKind factory。
 *
 * 把 SparkNodeTree 的 19 个公开方法翻译成协议层 ActionSchema。
 * 与旧 NodeTreeModule 静态工具表完全等价(action.name 与 SparkNodeTreeMethodKey
 * 一一对应),但语义协议要求 LLM 通过固定的 invokeAction 工具调用,
 * action 名由 describeKind 暴露给 LLM。
 *
 * 设计要点:
 * - 声明结构(name / description / paramsSchema / usageRules / failureModes),
 *   并把旧业务系统的执行函数绑定为 action runner。
 * - paramsSchema / usageRules / failureModes / example 直接复用旧 NodeTreeModule
 *   注册项,避免双源维护。旧 catalog 的 functionId 与新 action.name 多数相同;
 *   仅 collectDataViewKeys ↔ collectDataKeys 一个别名,见 OLD_FUNCTION_ID_OF。
 * - attributes 留空:节点树本体不暴露可读写属性,所有状态改动走 actions。
 * - children 留空:节点树不再分层声明子模块。
 */

import {
  ModuleKind,
  ok,
  type ActionSchema,
  type ModuleInstanceFinder,
  type ModuleInstanceRef,
  type ModuleKindRunner,
  type ModulePathContext,
} from '@spark-view/spark-ai/module-semantic'
import type { LlmJsonValue } from '@spark-view/spark-ai/schema'
import type {
  PageDesignNodeTree,
  PageDesignService,
  PageDesignServiceActionBinding,
  PageDesignServiceContext,
} from '@spark-view/spark-page-config/page/workspace'
import { NODE_TREE_ACTIONS } from '../modules/node-tree-tool-catalog'
import { serviceResultToOperationResult } from '../../module-semantic-service-result'

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

const OLD_ACTIONS: ReadonlyMap<string, ActionSchema> = new Map(
  NODE_TREE_ACTIONS.map((action) => [action.name, action]),
)

export const NODE_TREE_MODULE_ACTIONS: readonly ActionSchema[] = NODE_TREE_METHOD_NAMES.map((methodName) => actionFor(methodName))

type NodeTreeActionBinding = PageDesignServiceActionBinding<PageDesignNodeTree>

const NODE_TREE_ACTION_BINDINGS: Readonly<Record<string, NodeTreeActionBinding>> = {
  getNode: nodeTreeAction('getNode', false, (tree, args) => tree.getNode(args as Parameters<PageDesignNodeTree['getNode']>[0])),
  getLocation: nodeTreeAction('getLocation', false, (tree, args) => tree.getLocation(args as Parameters<PageDesignNodeTree['getLocation']>[0])),
  hasNode: nodeTreeAction('hasNode', false, (tree, args) => tree.hasNode(args as Parameters<PageDesignNodeTree['hasNode']>[0])),
  getParent: nodeTreeAction('getParent', false, (tree, args) => tree.getParent(args as Parameters<PageDesignNodeTree['getParent']>[0])),
  listChildren: nodeTreeAction('listChildren', false, (tree, args) => tree.listChildren(args as Parameters<PageDesignNodeTree['listChildren']>[0])),
  countNodes: nodeTreeAction('countNodes', false, (tree) => tree.countNodes()),
  getAllData: nodeTreeAction('getAllData', false, (tree) => tree.getAllData()),
  collectDataViewKeys: nodeTreeAction('collectDataViewKeys', false, (tree) => tree.collectDataViewKeys()),
  collectHandlerNames: nodeTreeAction('collectHandlerNames', false, (tree) => tree.collectHandlerNames()),
  findByType: nodeTreeAction('findByType', false, (tree, args) => tree.findByType(args as Parameters<PageDesignNodeTree['findByType']>[0])),
  addNode: nodeTreeAction('addNode', true, (tree, args) => tree.addNode(args as Parameters<PageDesignNodeTree['addNode']>[0])),
  addNodes: nodeTreeAction('addNodes', true, (tree, args) => tree.addNodes(args as Parameters<PageDesignNodeTree['addNodes']>[0])),
  moveNode: nodeTreeAction('moveNode', true, (tree, args) => tree.moveNode(args as Parameters<PageDesignNodeTree['moveNode']>[0])),
  setProps: nodeTreeAction('setProps', true, (tree, args) => tree.setProps(args as Parameters<PageDesignNodeTree['setProps']>[0])),
  setPropsBatch: nodeTreeAction('setPropsBatch', true, (tree, args) => tree.setPropsBatch(args as Parameters<PageDesignNodeTree['setPropsBatch']>[0])),
  replaceNode: nodeTreeAction('replaceNode', true, (tree, args) => tree.replaceNode(args as Parameters<PageDesignNodeTree['replaceNode']>[0])),
  replaceNodes: nodeTreeAction('replaceNodes', true, (tree, args) => tree.replaceNodes(args as Parameters<PageDesignNodeTree['replaceNodes']>[0])),
  removeNode: nodeTreeAction('removeNode', true, (tree, args) => tree.removeNode(args as Parameters<PageDesignNodeTree['removeNode']>[0])),
  removeNodes: nodeTreeAction('removeNodes', true, (tree, args) => tree.removeNodes(args as Parameters<PageDesignNodeTree['removeNodes']>[0])),
}

export interface NodeTreeModuleKindOptions {
  readonly service: PageDesignService
  readonly contextFactory: (ctx: ModulePathContext) => PageDesignServiceContext
}

/**
 * 节点树模块的语义协议 Kind factory。
 *
 * 协议层 describeKind 会让 LLM 看到所有 19 个 action 名 + 各自完整 paramsSchema /
 * usageRules / failureModes / example;具体调用经
 * invokeAction(actionName=getNode, args=...) 路由到注入的 runner。
 *
 * @moduleKind node-tree
 * @moduleFactory createNodeTreeModuleKind
 * @moduleRunner createNodeTreeRunnerDelegate
 * @moduleFindDelegate findCurrentNodeTreeInstance
 */
export function createNodeTreeModuleKind(options: NodeTreeModuleKindOptions): ModuleKind {
  return new ModuleKind({
    kind: 'node-tree',
    name: 'Page Design Node Tree',
    description: '当前页面 SparkNodeTree/rule.json 结构读写;通过 invokeAction 调用 19 个公开方法。',
    attributes: [],
    actions: NODE_TREE_MODULE_ACTIONS,
    children: [],
    runner: createNodeTreeRunnerDelegate(options),
    find: findCurrentNodeTreeInstance,
  })
}

function createNodeTreeRunnerDelegate(options: NodeTreeModuleKindOptions): ModuleKindRunner {
  return (ctx, actionName, args) => runNodeTreeAction(options, ctx, actionName, args)
}

const findCurrentNodeTreeInstance: ModuleInstanceFinder = (ctx, childKind, query) => {
  void query
  if (childKind !== 'node-tree' || ctx.segments.length !== 0) {
    return ok<readonly ModuleInstanceRef[]>([])
  }
  const ref = createCurrentNodeTreeRef(ctx)
  return ok<readonly ModuleInstanceRef[]>(ref === null ? [] : [ref])
}

function createCurrentNodeTreeRef(ctx: ModulePathContext): ModuleInstanceRef | null {
  const pageId = ctx.host?.moduleInstanceId
  if (pageId === undefined || pageId.length === 0) {
    return null
  }
  return { id: pageId, label: '当前页面节点树' }
}

async function runNodeTreeAction(
  options: NodeTreeModuleKindOptions,
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) {
  const binding = NODE_TREE_ACTION_BINDINGS[actionName]
  if (binding === undefined) {
    throw new Error(`node-tree action runner is not registered: ${actionName}`)
  }
  return serviceResultToOperationResult(
    await options.service.runNodeTreeAction(
      options.contextFactory(ctx),
      args,
      binding,
    ),
  )
}

function actionFor(methodName: typeof NODE_TREE_METHOD_NAMES[number]): ActionSchema {
  const oldId = OLD_FUNCTION_ID_OF.get(methodName) ?? methodName
  const action = OLD_ACTIONS.get(oldId)
  if (action === undefined) {
    throw new Error(
      `node-tree generated metadata missing legacy registration for ${methodName}/${oldId}`,
    )
  }
  return {
    name: methodName,
    description: action.description,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema !== undefined ? { resultSchema: action.resultSchema } : {}),
    ...(action.usageRules !== undefined && action.usageRules.length > 0
      ? { usageRules: action.usageRules }
      : {}),
    ...(action.failureModes !== undefined && action.failureModes.length > 0
      ? { failureModes: action.failureModes }
      : {}),
    ...(action.example !== undefined ? { example: action.example } : {}),
  }
}

function nodeTreeAction(
  serviceLabel: string,
  mutates: boolean,
  run: NodeTreeActionBinding['run'],
): NodeTreeActionBinding {
  return {
    serviceLabel,
    mutates,
    run,
  }
}
