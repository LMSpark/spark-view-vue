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

let session: IStillSession
let seq = 0

function exec(action: string, params: unknown = {}): StillResult {
  seq += 1
  return executeStill(action, params, session, `legacy-alias-${seq}`)
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

describe('sparkNodeTree legacy alias compatibility', () => {
  it('supports nodeId/nodeIds/parentId aliases across query and write actions', () => {
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
          ],
        },
      ],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    })
    expect(init.ok).toBe(true)

    const datasetExported = exec('dataset.export')
    expect(datasetExported.ok).toBe(true)

    const root = expectOk<{ type: string }>(exec('sparkNodeTree.getNode', { nodeId: 'root-table' }))
    expect(root.type).toBe('r-table')

    const location = expectOk<{ depth: number }>(exec('sparkNodeTree.getLocation', { nodeId: 'name-field' }))
    expect(location.depth).toBeGreaterThan(0)

    const exists = expectOk<boolean>(exec('sparkNodeTree.hasNode', { nodeId: 'name-field' }))
    expect(exists).toBe(true)

    const parent = expectOk<{ type: string } | null>(exec('sparkNodeTree.getParent', { nodeId: 'name-field' }))
    expect(parent?.type).toBe('r-table')

    const children = expectOk<unknown[]>(exec('sparkNodeTree.listChildren', { parentId: 'root-table' }))
    expect(children.length).toBe(1)

    const addNode = expectOk<{ index: number }>(exec('sparkNodeTree.addNode', {
      parentId: 'root-table',
      node: {
        type: 'r-text',
        id: 'legacy-a',
        props: { field: 'email', label: '邮箱' },
      },
    }))
    expect(addNode.index).toBeGreaterThanOrEqual(0)

    const addNodes = expectOk<{ indexes: number[] }>(exec('sparkNodeTree.addNodes', {
      parentId: 'root-table',
      nodes: [
        { type: 'r-text', id: 'legacy-b', props: { field: 'mobile', label: '手机号' } },
        { type: 'r-text', id: 'legacy-c', props: { field: 'title', label: '职位' } },
      ],
    }))
    expect(addNodes.indexes.length).toBe(2)

    const setProps = expectOk<{ node: { props?: Record<string, unknown> } }>(exec('sparkNodeTree.setProps', {
      nodeId: 'legacy-a',
      props: { class: 'legacy-a' },
      merge: true,
    }))
    expect(setProps.node.props?.['class']).toBe('legacy-a')

    const setPropsBatch = expectOk<{ nodes: unknown[] }>(exec('sparkNodeTree.setPropsBatch', {
      items: [
        { nodeId: 'legacy-b', props: { class: 'legacy-b' }, merge: true },
        { nodeId: 'legacy-c', props: { class: 'legacy-c' }, merge: true },
      ],
    }))
    expect(setPropsBatch.nodes.length).toBe(2)

    const replaceNode = expectOk<{ node: { props?: Record<string, unknown> } }>(exec('sparkNodeTree.replaceNode', {
      nodeId: 'legacy-c',
      node: {
        type: 'r-text',
        id: 'legacy-c',
        props: { field: 'position', label: '岗位' },
      },
    }))
    expect(replaceNode.node.props?.['field']).toBe('position')

    const replaceNodes = expectOk<{ items: unknown[] }>(exec('sparkNodeTree.replaceNodes', {
      items: [
        {
          nodeId: 'legacy-b',
          node: { type: 'r-text', id: 'legacy-b', props: { field: 'alias', label: '别名' } },
        },
        {
          nodeId: 'legacy-c',
          node: { type: 'r-text', id: 'legacy-c', props: { field: 'city', label: '城市' } },
        },
      ],
    }))
    expect(replaceNodes.items.length).toBe(2)

    expectOk(exec('sparkNodeTree.removeNode', { nodeId: 'legacy-a' }))

    const removedBatch = expectOk<{ items: unknown[] }>(exec('sparkNodeTree.removeNodes', { nodeIds: ['legacy-b', 'legacy-c'] }))
    expect(removedBatch.items.length).toBe(2)

    const remainsA = expectOk<boolean>(exec('sparkNodeTree.hasNode', { nodeId: 'legacy-a' }))
    const remainsB = expectOk<boolean>(exec('sparkNodeTree.hasNode', { nodeId: 'legacy-b' }))
    const remainsC = expectOk<boolean>(exec('sparkNodeTree.hasNode', { nodeId: 'legacy-c' }))
    expect(remainsA).toBe(false)
    expect(remainsB).toBe(false)
    expect(remainsC).toBe(false)
  })
})
