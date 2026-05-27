/**
 * NodeTree module-semantic 端到端测试。
 *
 * 覆盖 query/navigation tools、Host scope 透传、可发现链路和 NodeTree function tools。
 */

import { describe, expect, it } from 'vitest'

import {
  AiModuleRuntime,
} from '@spark-view/spark-ai/modules'
import type { AiAgentRuntimeContext } from '@spark-view/spark-ai/agent'
import type { PageDesignEditHost } from '../src/design/index'
import { SparkNodeTree } from '@spark-view/spark-data'
import { DataSetCrudTool } from '@spark-view/spark-data'
import { PageDesignService } from '../src/design/page-design-service'
import { PageDesignNodeTreeAiModule } from '../src/ai/node-tree-tool-catalog'
import { isRecord } from '@spark-view/spark-utils'
import { getArray, getRecord } from './helpers/test-utils'

function createHost(): { host: PageDesignEditHost; nodeTree: SparkNodeTree } {
  const nodeTree = SparkNodeTree.fromJson({ type: 'page', props: {}, children: [] })
  const dataSetTool = new DataSetCrudTool('page-design-test')
  dataSetTool.createTable({
    tableName: 'LeaveRequest',
    columns: [
      { name: 'id', type: 'string', isPrimaryKey: true },
      { name: 'applicantName', type: 'string' },
    ],
    resourceType: 'database-table',
    resourceId: 'hr.leave_request',
    views: { default: {} },
  })
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
  runtime: AiModuleRuntime
  nodeTree: SparkNodeTree
  hostContext: AiAgentRuntimeContext
} {
  const { host, nodeTree } = createHost()
  const service = new PageDesignService({ getEditHost: () => host })
  service.bootstrap({ pageId, requestId: 'e2e-run' })

  const runtime = new AiModuleRuntime()
  runtime.register(new PageDesignNodeTreeAiModule({
    service,
    contextFactory: (ctx) => ({
      pageId: ctx.host?.moduleInstanceId ?? ctx.segment?.id ?? '',
      requestId: ctx.host?.instanceId ?? 'e2e-run',
    }),
  }))

  return {
    runtime,
    nodeTree,
    hostContext: {
      moduleId: 'pageDesign',
      moduleInstanceId: pageId,
      instanceId: pageId,
    },
  }
}

describe('NodeTree module-semantic 接入(E2E)', () => {
  it('暴露 query/navigation tools 与 NodeTree function tools', () => {
    const { runtime } = buildRuntime()
    expect(runtime.getTools().map((tool) => tool.function.name)).toEqual(expect.arrayContaining([
      'queryModules',
      'queryFunctions',
      'guideFunction',
      'guideHumanQuestion',
      'getAttribute',
      'setAttribute',
      'listChildren',
      'findInstance',
      'describeKind',
      'node-tree_getNode',
    ]))
  })

  it('describeKind 列出 NodeTree functions 并完整返回 function 元数据', async () => {
    const { runtime, hostContext } = buildRuntime()
    const result = await runtime.executeTool('describeKind', { kind: 'node-tree' }, hostContext)
    const data = getRecord(result)
    const actions = data['functions']
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

  it('node-tree_getNode/countNodes/addNode 落到真实 SparkNodeTree', async () => {
    const { runtime, nodeTree, hostContext } = buildRuntime()

    const getNode = await runtime.executeTool('node-tree_getNode', {
      $paths: ['demo-page'],
      componentId: 'page__0',
    }, hostContext)
    expect(getRecord(getNode)['id']).toBe('page__0')

    const countBefore = await runtime.executeTool('node-tree_countNodes', {
      $paths: ['demo-page'],
    }, hostContext)
    expect(countBefore).toMatchObject({ ok: true, data: 1 })

    const added = await runtime.executeTool('node-tree_addNode', {
      $paths: ['demo-page'],
      parentComponentId: 'page__0',
      node: { type: 'r-text', id: 'applicant-name-field', props: { field: 'applicantName', label: '申请人' } },
    }, hostContext)
    expect(added.ok).toBe(true)
    expect(nodeTree.countNodes()).toBe(2)
  })

  it('协议层校验未知 action 与 action paramsSchema', async () => {
    const { runtime, hostContext } = buildRuntime()
    const unknown = await runtime.executeTool('node-tree_noSuchMethod', {
      $paths: ['demo-page'],
    }, hostContext)
    expect(unknown).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'FUNCTION_NOT_DECLARED' })],
    })

    const invalidArgs = await runtime.executeTool('node-tree_getNode', {
      $paths: ['demo-page'],
    }, hostContext)
    expect(invalidArgs.ok).toBe(false)
    if (invalidArgs.ok) throw new Error('expected invalid args')
    expect(invalidArgs.checks?.some((check) => check.code === 'SCHEMA_VALIDATION_FAILED')).toBe(true)
  })
})

describe('NodeTree module-semantic 可发现链路', () => {
  it('listChildren → findInstance → describeKind → node-tree_getNode 使用发现到的实例 id', async () => {
    const pageId = 'lmspark/homepage'
    const { runtime, hostContext } = buildRuntime(pageId)

    const listResult = await runtime.executeTool('listChildren', { path: '/' }, hostContext)
    const rootEntries = getArray(listResult)
    expect(rootEntries.some((entry) => isRecord(entry) && entry['id'] === 'node-tree')).toBe(true)

    const findResult = await runtime.executeTool('findInstance', {
      path: '/',
      childKind: 'node-tree',
      query: {},
    }, hostContext)
    const instances = getArray(findResult)
    const first = instances[0]
    if (!isRecord(first) || typeof first['id'] !== 'string') {
      throw new Error('expected discovered node-tree id')
    }
    expect(first['id']).toBe(pageId)
    expect(first['label']).toBe('当前页面节点树')

    const describeResult = await runtime.executeTool('describeKind', { kind: 'node-tree' }, hostContext)
    const describeData = getRecord(describeResult)
    const functions = describeData['functions']
    if (!Array.isArray(functions)) throw new Error('functions not array')
    const getNode = functions.find((action) => isRecord(action) && action['name'] === 'getNode')
    if (!isRecord(getNode) || !isRecord(getNode['paramsSchema'])) {
      throw new Error('getNode paramsSchema missing')
    }
    expect(getNode['paramsSchema']['additionalProperties']).not.toBe(true)

    const invokeResult = await runtime.executeTool('node-tree_getNode', {
      $paths: [first['id']],
      componentId: 'page__0',
    }, hostContext)
    expect(getRecord(invokeResult)['type']).toBe('page')
  })
})

