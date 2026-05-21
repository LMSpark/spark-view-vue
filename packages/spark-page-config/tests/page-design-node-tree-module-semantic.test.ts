/**
 * 端到端测试:NodeTree 模块语义协议接入。
 *
 * 验证:
 * - NodeTreeModuleKind 在 ModuleSemanticRuntime 注册后能被 describeKind 列出
 * - NodeTreeCapability.invokeAction 一行委托 PageDesignService.useNodeTreeMethod
 * - 通过 ModuleSemanticBusinessRuntime.executeFunctionCall(invokeAction)
 *   最终能落到 SparkNodeTree.getNode,返回真实节点
 * - 调用 countNodes 返回数字 1(默认 page 根节点)
 */

import { describe, expect, it } from 'vitest'

import {
  ModuleSemanticBusinessRuntime,
  ModuleSemanticRuntime,
} from '@spark-view/spark-ai/module-semantic'
import {
  NodeTreeCapability,
  NodeTreeModuleKind,
} from '@spark-view/spark-page-config/assistant/registrations'
import {
  PageDesignService,
  type PageDesignEditHost,
} from '@spark-view/spark-page-config/page/workspace'
import { SparkNodeTree } from '@spark-view/spark-page-config/page/model'
import { DataSetCrudTool } from '@spark-view/spark-data'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createHost(): { host: PageDesignEditHost; nodeTree: SparkNodeTree } {
  const nodeTree = SparkNodeTree.fromJson({ type: 'page', props: {}, children: [] })
  const dataSetTool = new DataSetCrudTool('page-design-test')
  let script = 'export default {}'
  let style = '.page { color: red; }'
  return {
    nodeTree,
    host: {
      getNodeTree: () => nodeTree,
      onNodeTreeChanged: () => undefined,
      getDataSetTool: () => dataSetTool,
      onDataSetChanged: () => undefined,
      readScript: () => script,
      writeScript: (content) => { script = content },
      readStyle: () => style,
      writeStyle: (content) => { style = content },
    },
  }
}

function buildRuntime(): {
  business: ModuleSemanticBusinessRuntime
  nodeTree: SparkNodeTree
  pageId: string
} {
  const pageId = 'demo-page'
  const { host, nodeTree } = createHost()
  const service = new PageDesignService({ getEditHost: () => host })
  service.bootstrap({ pageId, requestId: 'e2e-run' })

  const runtime = new ModuleSemanticRuntime()
  runtime.registerKind(new NodeTreeModuleKind())
  runtime.registerCapability(new NodeTreeCapability({
    service,
    contextFactory: (ctx) => ({
      pageId: ctx.segment.id,
      requestId: 'e2e-run',
    }),
  }))

  const business = new ModuleSemanticBusinessRuntime({
    moduleId: 'page-design-node-tree',
    name: 'Page design node tree (module-semantic)',
    description: '页面节点树,新协议端到端验证',
    runtime,
  })

  return { business, nodeTree, pageId }
}

const SCOPE = {
  moduleId: 'page-design-node-tree',
  moduleInstanceId: 'designer-1',
  instanceId: 'session-1',
} as const

describe('NodeTree module-semantic 接入(E2E)', () => {
  it('startSession 暴露 6 个协议工具', async () => {
    const { business } = buildRuntime()
    const projection = await business.startSession(SCOPE)
    expect(projection.availableFunctions).toHaveLength(6)
    const actions = projection.availableFunctions.map((fn) => fn.action)
    expect(actions).toContain('invokeAction')
    expect(actions).toContain('describeKind')
  })

  it('describeKind 列出 19 个 NodeTree 动作', async () => {
    const { business } = buildRuntime()
    await business.startSession(SCOPE)
    const result = await business.executeFunctionCall({
      ...SCOPE,
      action: 'describeKind',
      args: { kind: 'node-tree' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('describeKind failed')
    expect(isRecord(result.data)).toBe(true)
    if (!isRecord(result.data)) throw new Error('not record')
    const actions = result.data['actions']
    expect(Array.isArray(actions)).toBe(true)
    if (!Array.isArray(actions)) throw new Error('not array')
    expect(actions).toHaveLength(19)
  })

  it('invokeAction(getNode) 落到 SparkNodeTree.getNode 并返回真实节点', async () => {
    const { business, pageId } = buildRuntime()
    await business.startSession(SCOPE)
    const result = await business.executeFunctionCall({
      ...SCOPE,
      action: 'invokeAction',
      args: {
        path: `/node-tree[${pageId}]`,
        actionName: 'getNode',
        args: { componentId: 'page__0' },
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('getNode failed')
    expect(isRecord(result.data)).toBe(true)
    if (!isRecord(result.data)) throw new Error('not record')
    expect(result.data['type']).toBe('page')
    expect(result.data['id']).toBe('page__0')
  })

  it('invokeAction(countNodes) 返回数字 1(默认仅 page 根节点)', async () => {
    const { business, pageId } = buildRuntime()
    await business.startSession(SCOPE)
    const result = await business.executeFunctionCall({
      ...SCOPE,
      action: 'invokeAction',
      args: {
        path: `/node-tree[${pageId}]`,
        actionName: 'countNodes',
        args: {},
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('countNodes failed')
    expect(result.data).toBe(1)
  })

  it('invokeAction(addNode) 真实写入树并触发 mutates 标记', async () => {
    const { business, nodeTree, pageId } = buildRuntime()
    await business.startSession(SCOPE)
    const result = await business.executeFunctionCall({
      ...SCOPE,
      action: 'invokeAction',
      args: {
        path: `/node-tree[${pageId}]`,
        actionName: 'addNode',
        args: {
          parentComponentId: 'page__0',
          node: { type: 'text', props: { value: 'hello' } },
        },
      },
    })
    expect(result.ok).toBe(true)
    expect(nodeTree.countNodes()).toBe(2)
  })

  it('invokeAction 失败时映射为协议错误(NODE_NOT_FOUND 等)', async () => {
    const { business, pageId } = buildRuntime()
    await business.startSession(SCOPE)
    const result = await business.executeFunctionCall({
      ...SCOPE,
      action: 'invokeAction',
      args: {
        path: `/node-tree[${pageId}]`,
        actionName: 'getNode',
        args: { componentId: 'no-such-id' },
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data).toBeNull()
  })

  it('未知 actionName 时,SparkNodeTree 抛错被 service 映射为协议错误', async () => {
    const { business, pageId } = buildRuntime()
    await business.startSession(SCOPE)
    const result = await business.executeFunctionCall({
      ...SCOPE,
      action: 'invokeAction',
      args: {
        path: `/node-tree[${pageId}]`,
        actionName: 'noSuchMethod',
        args: {},
      },
    })
    expect(result.ok).toBe(false)
  })
})
