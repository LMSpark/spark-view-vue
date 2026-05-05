import { beforeEach, describe, expect, it } from 'vitest'
import type { FunctionResult } from '@spark-view/spark-ai'
import { SparkNodeTree, type SparkNode } from '../packages/spark-component/src/index'
import { DataSetCrudTool, type IDataSetMetadata } from '../packages/spark-data/src/index'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE } from '../packages/spark-ai/src/business/page-design/functions/node-tree'
import { createPageDesignFunctionHarness } from './helpers/page-design-functions'

let seq = 0
let liveTree: SparkNodeTree
let liveDataSet: DataSetCrudTool
let script = ''
let style = ''
let harnessExec: (action: string, params?: unknown, requestId?: string) => FunctionResult

function exec(action: string, params: unknown = {}): FunctionResult {
  seq += 1
  return harnessExec(action, params, `tree-exec-${seq}`)
}

function expectOk<T = unknown>(result: FunctionResult): T {
  if (!result.ok) {
    throw new Error(`${result.code ?? 'UNKNOWN'}: ${result.msg ?? 'still execution failed'}${result.fix !== undefined ? ` | fix=${result.fix}` : ''}`)
  }
  return result.data as T
}

beforeEach(() => {
  seq = 0
  liveTree = new SparkNodeTree({ root: { type: 'page', children: [] } })
  liveDataSet = DataSetCrudTool.fromJson({ dataSetName: 'PageDataSet', tables: {} })
  script = ''
  style = ''
  harnessExec = createPageDesignFunctionHarness({
    getNodeTree: () => liveTree,
    getDataSetTool: () => liveDataSet,
    readScript: () => script,
    writeScript(content) {
      script = content
    },
    readStyle: () => style,
    writeStyle(content) {
      style = content
    },
  }).exec
})

function seedLiveModel(params: {
  ruleJson: SparkNode[]
  pageDataJson: IDataSetMetadata
  scriptJs: string
  styleCss: string
}): void {
  liveTree.loadRoot({ type: 'page', children: params.ruleJson })
  liveDataSet.replaceFromJson(params.pageDataJson, { commitHistory: false })
  script = params.scriptJs
  style = params.styleCss
}

describe('sparkNodeTree function execution coverage', () => {
  it('includes catalog example in EXECUTE_ERROR fix for addNode', () => {
    const bootstrapPayload = {
      ruleJson: [
        {
          type: 'r-table',
          id: 'root-table',
          props: { dataKey: 'Users@rows' },
          children: [],
        },
      ],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    }
    seedLiveModel(bootstrapPayload)

    const init = exec('pageDesign@lifecycle@bootstrap', {})
    expect(init.ok).toBe(true)

    const failedAdd = exec('pageDesign@nodeTree@addNode', {
      parentComponentId: 'root-table',
      node: {
        type: '',
        id: 'broken-node',
      },
      index: 0,
    })

    expect(failedAdd.ok).toBe(false)
    if (failedAdd.ok) return
    expect(failedAdd.code).toBe('EXECUTE_ERROR')
    expect(failedAdd.fix ?? '').toContain('示例')
    expect(failedAdd.fix ?? '').toContain('"parentComponentId":"toolbar"')
    expect(failedAdd.fix ?? '').toContain('"node":{"type":"r-button"')
  })

  it('executes all sparkNodeTree actions in one editing session', () => {
    const executedActions = new Set<string>()

    const bootstrapPayload = {
      ruleJson: [
        {
          type: 'r-table',
          id: 'root-table',
          props: {
            dataKey: 'Users@rows',
            on: { refresh: 'handleRefresh' },
          },
          children: [
            {
              type: 'r-text',
              id: 'name-field',
              props: {
                field: 'name',
                label: '姓名',
              },
            },
            {
              type: 'r-button',
              id: 'toolbar-btn',
              props: {
                on: { click: 'handleClick' },
              },
            },
          ],
        },
      ],
      pageDataJson: {
        dataSetName: 'PageDataSet',
        tables: {
          Users: {
            tableName: 'Users',
            columns: [
              { name: 'id', type: 'number', isPrimaryKey: true },
              { name: 'name', type: 'string' },
            ],
            views: { default: { rows: [] } },
          },
        },
      },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    }
    seedLiveModel(bootstrapPayload)

    const init = exec('pageDesign@lifecycle@bootstrap', {})
    expect(init.ok).toBe(true)

    const getNode = exec('pageDesign@nodeTree@getNode', { componentId: 'root-table' })
    executedActions.add('pageDesign@nodeTree@getNode')
    const node = expectOk<{ type: string }>(getNode)
    expect(node.type).toBe('r-table')

    const getLocation = exec('pageDesign@nodeTree@getLocation', { componentId: 'name-field' })
    executedActions.add('pageDesign@nodeTree@getLocation')
    const location = expectOk<{ depth: number; parent: { type: string } | null }>(getLocation)
    expect(location.depth).toBeGreaterThan(0)
    expect(location.parent?.type).toBe('r-table')

    const hasNode = exec('pageDesign@nodeTree@hasNode', { componentId: 'toolbar-btn' })
    executedActions.add('pageDesign@nodeTree@hasNode')
    const exists = expectOk<boolean>(hasNode)
    expect(exists).toBe(true)

    const getParent = exec('pageDesign@nodeTree@getParent', { componentId: 'name-field' })
    executedActions.add('pageDesign@nodeTree@getParent')
    const parent = expectOk<{ type: string } | null>(getParent)
    expect(parent?.type).toBe('r-table')

    const listChildren = exec('pageDesign@nodeTree@listChildren', { parentComponentId: 'root-table' })
    executedActions.add('pageDesign@nodeTree@listChildren')
    const initialChildren = expectOk<unknown[]>(listChildren)
    expect(initialChildren.length).toBe(2)

    const countNodes = exec('pageDesign@nodeTree@countNodes')
    executedActions.add('pageDesign@nodeTree@countNodes')
    const nodeCount = expectOk<number>(countNodes)
    expect(nodeCount).toBeGreaterThan(0)

    const getAllData = exec('pageDesign@nodeTree@getAllData')
    executedActions.add('pageDesign@nodeTree@getAllData')
    const allData = expectOk<{ type: string; children?: unknown[] }>(getAllData)
    expect(allData.type).toBe('page')
    expect(Array.isArray(allData.children)).toBe(true)

    const findByType = exec('pageDesign@nodeTree@findByType', { type: 'r-text' })
    executedActions.add('pageDesign@nodeTree@findByType')
    const findByTypeResult = expectOk<{ total: number; matches: unknown[] }>(findByType)
    expect(findByTypeResult.total).toBeGreaterThan(0)
    expect(findByTypeResult.matches.length).toBeGreaterThan(0)

    const collectHandlerNames = exec('pageDesign@nodeTree@collectHandlerNames')
    executedActions.add('pageDesign@nodeTree@collectHandlerNames')
    const handlers = expectOk<Set<string>>(collectHandlerNames)
    expect(Array.from(handlers)).toEqual(expect.arrayContaining(['handleRefresh', 'handleClick']))

    const addNode = exec('pageDesign@nodeTree@addNode', {
      parentComponentId: 'root-table',
      node: {
        type: 'r-text',
        id: 'extra-1',
        props: { field: 'email', label: '邮箱' },
      },
    })
    executedActions.add('pageDesign@nodeTree@addNode')
    const addNodeResult = expectOk<{ index: number }>(addNode)
    expect(addNodeResult.index).toBeGreaterThanOrEqual(0)

    const addNodes = exec('pageDesign@nodeTree@addNodes', {
      parentComponentId: 'root-table',
      nodes: [
        { type: 'r-text', id: 'extra-2', props: { field: 'mobile', label: '手机号' } },
        { type: 'r-text', id: 'extra-3', props: { field: 'title', label: '职位' } },
      ],
    })
    executedActions.add('pageDesign@nodeTree@addNodes')
    const addNodesResult = expectOk<{ indexes: number[] }>(addNodes)
    expect(addNodesResult.indexes.length).toBe(2)

    const moveNode = exec('pageDesign@nodeTree@moveNode', {
      componentId: 'extra-3',
      parentComponentId: 'root-table',
      index: 1,
    })
    executedActions.add('pageDesign@nodeTree@moveNode')
    const moveNodeResult = expectOk<{
      componentId: string
      fromParentComponentId: string | null
      toParentComponentId: string | null
      previousIndex: number
      index: number
    }>(moveNode)
    expect(moveNodeResult).toMatchObject({
      componentId: 'extra-3',
      fromParentComponentId: 'root-table',
      toParentComponentId: 'root-table',
      previousIndex: 4,
      index: 1,
    })
    expect(JSON.stringify(moveNodeResult)).not.toContain('r-text')
    const movedChildren = liveTree.listChildren({ parentComponentId: 'root-table' })
      .filter((child): child is SparkNode => typeof child !== 'string')
    expect(movedChildren.map((child) => child.id).indexOf('extra-3')).toBe(1)

    const setProps = exec('pageDesign@nodeTree@setProps', {
      componentId: 'root-table',
      props: { border: true },
      merge: true,
    })
    executedActions.add('pageDesign@nodeTree@setProps')
    const setPropsResult = expectOk<{ node: { props?: Record<string, unknown> } }>(setProps)
    expect(setPropsResult.node.props?.['border']).toBe(true)

    const setPropsBatch = exec('pageDesign@nodeTree@setPropsBatch', {
      items: [
        { componentId: 'extra-1', props: { class: 'c1' }, merge: true },
        { componentId: 'extra-2', props: { class: 'c2' }, merge: true },
      ],
    })
    executedActions.add('pageDesign@nodeTree@setPropsBatch')
    const setPropsBatchResult = expectOk<{ nodes: unknown[] }>(setPropsBatch)
    expect(setPropsBatchResult.nodes.length).toBe(2)

    const replaceNode = exec('pageDesign@nodeTree@replaceNode', {
      componentId: 'extra-3',
      node: {
        type: 'r-text',
        id: 'extra-3',
        props: { field: 'position', label: '岗位' },
      },
    })
    executedActions.add('pageDesign@nodeTree@replaceNode')
    const replaceNodeResult = expectOk<{ node: { props?: Record<string, unknown> } }>(replaceNode)
    expect(replaceNodeResult.node.props?.['field']).toBe('position')

    const replaceNodes = exec('pageDesign@nodeTree@replaceNodes', {
      items: [
        {
          componentId: 'extra-1',
          node: { type: 'r-text', id: 'extra-1', props: { field: 'alias', label: '别名' } },
        },
        {
          componentId: 'extra-2',
          node: { type: 'r-text', id: 'extra-2', props: { field: 'city', label: '城市' } },
        },
      ],
    })
    executedActions.add('pageDesign@nodeTree@replaceNodes')
    const replaceNodesResult = expectOk<{ items: unknown[] }>(replaceNodes)
    expect(replaceNodesResult.items.length).toBe(2)

    const removeNode = exec('pageDesign@nodeTree@removeNode', { componentId: 'extra-1' })
    executedActions.add('pageDesign@nodeTree@removeNode')
    const removeNodeResult = expectOk<{ removed: { id?: string } }>(removeNode)
    expect(removeNodeResult.removed.id).toBe('extra-1')

    const removeNodes = exec('pageDesign@nodeTree@removeNodes', { componentIds: ['extra-2', 'extra-3'] })
    executedActions.add('pageDesign@nodeTree@removeNodes')
    const removeNodesResult = expectOk<{ items: unknown[] }>(removeNodes)
    expect(removeNodesResult.items.length).toBe(2)

    const actionIds = SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map((row) => row.action).sort((a, b) => a.localeCompare(b))
    expect(Array.from(executedActions).sort((a, b) => a.localeCompare(b))).toEqual(actionIds)
  })
})
