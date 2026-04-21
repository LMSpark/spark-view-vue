import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearDomains,
  clearRegistry,
  createSession,
  executeStill,
  registerEditStills,
  type IStillSession,
  type StillResult,
} from '../packages/spark-ai/src/stills'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE } from '../packages/spark-ai/src/stills/spark-node-tree-tool-catalog'

let session: IStillSession
let seq = 0

function exec(action: string, params: unknown = {}): StillResult {
  seq += 1
  return executeStill(action, params, session, `tree-exec-${seq}`)
}

function expectOk<T = unknown>(result: StillResult): T {
  if (!result.ok) {
    throw new Error(`${result.code ?? 'UNKNOWN'}: ${result.msg ?? 'still execution failed'}${result.fix !== undefined ? ` | fix=${result.fix}` : ''}`)
  }
  return result.data as T
}

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerEditStills()
  session = createSession()
  seq = 0
})

describe('sparkNodeTree stills execution coverage', () => {
  it('includes catalog example in EXECUTE_ERROR fix for addNode', () => {
    const init = exec('edit.bootstrap', {
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
    })
    expect(init.ok).toBe(true)

    const failedAdd = exec('sparkNodeTree.addNode', {
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

    const init = exec('edit.bootstrap', {
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
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    })
    expect(init.ok).toBe(true)

    const getNode = exec('sparkNodeTree.getNode', { componentId: 'root-table' })
    executedActions.add('sparkNodeTree.getNode')
    const node = expectOk<{ type: string }>(getNode)
    expect(node.type).toBe('r-table')

    const getLocation = exec('sparkNodeTree.getLocation', { componentId: 'name-field' })
    executedActions.add('sparkNodeTree.getLocation')
    const location = expectOk<{ depth: number; parent: { type: string } | null }>(getLocation)
    expect(location.depth).toBeGreaterThan(0)
    expect(location.parent?.type).toBe('r-table')

    const hasNode = exec('sparkNodeTree.hasNode', { componentId: 'toolbar-btn' })
    executedActions.add('sparkNodeTree.hasNode')
    const exists = expectOk<boolean>(hasNode)
    expect(exists).toBe(true)

    const getParent = exec('sparkNodeTree.getParent', { componentId: 'name-field' })
    executedActions.add('sparkNodeTree.getParent')
    const parent = expectOk<{ type: string } | null>(getParent)
    expect(parent?.type).toBe('r-table')

    const listChildren = exec('sparkNodeTree.listChildren', { parentComponentId: 'root-table' })
    executedActions.add('sparkNodeTree.listChildren')
    const initialChildren = expectOk<unknown[]>(listChildren)
    expect(initialChildren.length).toBe(2)

    const countNodes = exec('sparkNodeTree.countNodes')
    executedActions.add('sparkNodeTree.countNodes')
    const nodeCount = expectOk<number>(countNodes)
    expect(nodeCount).toBeGreaterThan(0)

    const collectDataKeys = exec('sparkNodeTree.collectDataKeys')
    executedActions.add('sparkNodeTree.collectDataKeys')
    const dataKeys = expectOk<Set<string>>(collectDataKeys)
    expect(Array.from(dataKeys)).toContain('Users@rows')

    const collectHandlerNames = exec('sparkNodeTree.collectHandlerNames')
    executedActions.add('sparkNodeTree.collectHandlerNames')
    const handlers = expectOk<Set<string>>(collectHandlerNames)
    expect(Array.from(handlers)).toEqual(expect.arrayContaining(['handleRefresh', 'handleClick']))

    const addNode = exec('sparkNodeTree.addNode', {
      parentComponentId: 'root-table',
      node: {
        type: 'r-text',
        id: 'extra-1',
        props: { field: 'email', label: '邮箱' },
      },
    })
    executedActions.add('sparkNodeTree.addNode')
    const addNodeResult = expectOk<{ index: number }>(addNode)
    expect(addNodeResult.index).toBeGreaterThanOrEqual(0)

    const addNodes = exec('sparkNodeTree.addNodes', {
      parentComponentId: 'root-table',
      nodes: [
        { type: 'r-text', id: 'extra-2', props: { field: 'mobile', label: '手机号' } },
        { type: 'r-text', id: 'extra-3', props: { field: 'title', label: '职位' } },
      ],
    })
    executedActions.add('sparkNodeTree.addNodes')
    const addNodesResult = expectOk<{ indexes: number[] }>(addNodes)
    expect(addNodesResult.indexes.length).toBe(2)

    const setProps = exec('sparkNodeTree.setProps', {
      componentId: 'root-table',
      props: { border: true },
      merge: true,
    })
    executedActions.add('sparkNodeTree.setProps')
    const setPropsResult = expectOk<{ node: { props?: Record<string, unknown> } }>(setProps)
    expect(setPropsResult.node.props?.['border']).toBe(true)

    const setPropsBatch = exec('sparkNodeTree.setPropsBatch', {
      items: [
        { componentId: 'extra-1', props: { class: 'c1' }, merge: true },
        { componentId: 'extra-2', props: { class: 'c2' }, merge: true },
      ],
    })
    executedActions.add('sparkNodeTree.setPropsBatch')
    const setPropsBatchResult = expectOk<{ nodes: unknown[] }>(setPropsBatch)
    expect(setPropsBatchResult.nodes.length).toBe(2)

    const replaceNode = exec('sparkNodeTree.replaceNode', {
      componentId: 'extra-3',
      node: {
        type: 'r-text',
        id: 'extra-3',
        props: { field: 'position', label: '岗位' },
      },
    })
    executedActions.add('sparkNodeTree.replaceNode')
    const replaceNodeResult = expectOk<{ node: { props?: Record<string, unknown> } }>(replaceNode)
    expect(replaceNodeResult.node.props?.['field']).toBe('position')

    const replaceNodes = exec('sparkNodeTree.replaceNodes', {
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
    executedActions.add('sparkNodeTree.replaceNodes')
    const replaceNodesResult = expectOk<{ items: unknown[] }>(replaceNodes)
    expect(replaceNodesResult.items.length).toBe(2)

    const removeNode = exec('sparkNodeTree.removeNode', { componentId: 'extra-1' })
    executedActions.add('sparkNodeTree.removeNode')
    const removeNodeResult = expectOk<{ removed: { id?: string } }>(removeNode)
    expect(removeNodeResult.removed.id).toBe('extra-1')

    const removeNodes = exec('sparkNodeTree.removeNodes', { componentIds: ['extra-2', 'extra-3'] })
    executedActions.add('sparkNodeTree.removeNodes')
    const removeNodesResult = expectOk<{ items: unknown[] }>(removeNodes)
    expect(removeNodesResult.items.length).toBe(2)

    const actionIds = SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map((row) => row.action).sort((a, b) => a.localeCompare(b))
    expect(Array.from(executedActions).sort((a, b) => a.localeCompare(b))).toEqual(actionIds)
  })
})
