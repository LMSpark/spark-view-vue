/**
 * NodeTree module-semantic 端到端测试。
 *
 * 覆盖固定协议工具、Host scope 透传、可发现链路和 19 个 NodeTree action。
 */

import { describe, expect, it } from 'vitest'

import {
  ModuleSemanticRuntime,
} from '@spark-view/spark-ai/module-semantic'
import type { AiHostBusinessRuntimeContext } from '@spark-view/spark-ai/host'
import {
  PageDesignEditSession,
} from '@spark-view/spark-page-config/capabilities/page-edit-session'
import {
  PageDesignService,
} from '@spark-view/spark-page-config/capabilities/page-design-service'
import { SparkNodeTree } from '@spark-view/spark-page-config/page/spark-node-tree'
import { DataSetCrudTool } from '@spark-view/spark-data'
import { PageDesignNodeTreeModuleKind } from '../src/registrations/node-tree-tool-catalog'
import { isRecord } from '@spark-view/spark-page-config/capabilities/json-document'

function createHost(): { host: PageDesignEditSession.Host; nodeTree: SparkNodeTree } {
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

function buildRuntime(pageId = 'demo-page'): {
  runtime: ModuleSemanticRuntime
  nodeTree: SparkNodeTree
  hostContext: AiHostBusinessRuntimeContext
} {
  const { host, nodeTree } = createHost()
  const service = new PageDesignService({ getEditHost: () => host })
  service.bootstrap({ pageId, requestId: 'e2e-run' })

  const runtime = new ModuleSemanticRuntime()
  runtime.registerKind(new PageDesignNodeTreeModuleKind({
    service,
    contextFactory: (ctx) => ({
      pageId: ctx.host?.moduleInstanceId ?? ctx.segment.id,
      requestId: ctx.host?.instanceId ?? 'e2e-run',
    }),
  }))

  return {
    runtime,
    nodeTree,
    hostContext: {
      moduleId: 'pageDesign',
      moduleInstanceId: pageId,
      instanceId: `pageDesign:${pageId}`,
    },
  }
}

function getDataRecord(result: { readonly ok: boolean; readonly data?: unknown }): Record<string, unknown> {
  if (!result.ok || !isRecord(result.data)) {
    throw new Error('expected ok record result')
  }
  return result.data
}

function getDataArray(result: { readonly ok: boolean; readonly data?: unknown }): unknown[] {
  if (!result.ok || !Array.isArray(result.data)) {
    throw new Error('expected ok array result')
  }
  return result.data
}

describe('NodeTree module-semantic 接入(E2E)', () => {
  it('暴露固定 6 个协议工具', () => {
    const { runtime } = buildRuntime()
    expect(runtime.getLlmTools().map((tool) => tool.function.name)).toEqual([
      'getAttribute',
      'setAttribute',
      'invokeAction',
      'listChildren',
      'findInstance',
      'describeKind',
    ])
  })

  it('describeKind 列出 19 个 NodeTree 动作并完整返回 action 元数据', async () => {
    const { runtime, hostContext } = buildRuntime()
    const result = await runtime.executeTool('describeKind', { kind: 'node-tree' }, hostContext)
    const data = getDataRecord(result)
    const actions = data['actions']
    expect(Array.isArray(actions)).toBe(true)
    if (!Array.isArray(actions)) throw new Error('actions not array')
    expect(actions).toHaveLength(19)
    for (const action of actions) {
      if (!isRecord(action)) throw new Error('action not record')
      expect(action).toHaveProperty('paramsSchema')
      expect(action).toHaveProperty('resultSchema')
      expect(action).toHaveProperty('usageRules')
      expect(action).toHaveProperty('failureModes')
      expect(action).toHaveProperty('example')
    }
  })

  it('invokeAction(getNode/countNodes/addNode) 落到真实 SparkNodeTree', async () => {
    const { runtime, nodeTree, hostContext } = buildRuntime()

    const getNode = await runtime.executeTool('invokeAction', {
      path: '/node-tree[demo-page]',
      actionName: 'getNode',
      args: { componentId: 'page__0' },
    }, hostContext)
    expect(getDataRecord(getNode)['id']).toBe('page__0')

    const countBefore = await runtime.executeTool('invokeAction', {
      path: '/node-tree[demo-page]',
      actionName: 'countNodes',
      args: {},
    }, hostContext)
    expect(countBefore).toMatchObject({ ok: true, data: 1 })

    const added = await runtime.executeTool('invokeAction', {
      path: '/node-tree[demo-page]',
      actionName: 'addNode',
      args: {
        parentComponentId: 'page__0',
        node: { type: 'text', props: { value: 'hello' } },
      },
    }, hostContext)
    expect(added.ok).toBe(true)
    expect(nodeTree.countNodes()).toBe(2)
  })

  it('协议层校验未知 action 与 action paramsSchema', async () => {
    const { runtime, hostContext } = buildRuntime()
    const unknown = await runtime.executeTool('invokeAction', {
      path: '/node-tree[demo-page]',
      actionName: 'noSuchMethod',
      args: {},
    }, hostContext)
    expect(unknown).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'ACTION_NOT_DECLARED' })],
    })

    const invalidArgs = await runtime.executeTool('invokeAction', {
      path: '/node-tree[demo-page]',
      actionName: 'getNode',
      args: {},
    }, hostContext)
    expect(invalidArgs.ok).toBe(false)
    if (invalidArgs.ok) throw new Error('expected invalid args')
    expect(invalidArgs.checks?.some((check) => check.code === 'INVALID_ARGS')).toBe(true)
  })
})

describe('NodeTree module-semantic 可发现链路', () => {
  it('listChildren → findInstance → describeKind → invokeAction 使用发现到的实例 id', async () => {
    const pageId = 'lmspark/homepage'
    const { runtime, hostContext } = buildRuntime(pageId)

    const listResult = await runtime.executeTool('listChildren', { path: '/' }, hostContext)
    const rootEntries = getDataArray(listResult)
    expect(rootEntries.some((entry) => isRecord(entry) && entry['id'] === 'node-tree')).toBe(true)

    const findResult = await runtime.executeTool('findInstance', {
      path: '/',
      childKind: 'node-tree',
      query: {},
    }, hostContext)
    const instances = getDataArray(findResult)
    const first = instances[0]
    if (!isRecord(first) || typeof first['id'] !== 'string') {
      throw new Error('expected discovered node-tree id')
    }
    expect(first['id']).toBe(pageId)
    expect(first['label']).toBe('当前页面节点树')

    const describeResult = await runtime.executeTool('describeKind', { kind: 'node-tree' }, hostContext)
    const describeData = getDataRecord(describeResult)
    const actions = describeData['actions']
    if (!Array.isArray(actions)) throw new Error('actions not array')
    const getNode = actions.find((action) => isRecord(action) && action['name'] === 'getNode')
    if (!isRecord(getNode) || !isRecord(getNode['paramsSchema'])) {
      throw new Error('getNode paramsSchema missing')
    }
    expect(getNode['paramsSchema']['additionalProperties']).not.toBe(true)

    const invokeResult = await runtime.executeTool('invokeAction', {
      path: `/node-tree[${first['id']}]`,
      actionName: 'getNode',
      args: { componentId: 'page__0' },
    }, hostContext)
    expect(getDataRecord(invokeResult)['type']).toBe('page')
  })
})
