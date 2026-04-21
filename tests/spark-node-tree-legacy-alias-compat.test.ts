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

function expectInvalidAlias(result: StillResult, aliasKey: string): void {
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.code).toBe('INVALID_PARAMS')
  expect(`${result.msg ?? ''} ${result.fix ?? ''}`).toContain(aliasKey)
}

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerEditStills()
  session = createSession()
  seq = 0
})

describe('sparkNodeTree legacy alias compatibility', () => {
  it('rejects nodeId/nodeIds/parentId aliases across query and write actions', () => {
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

    expectInvalidAlias(exec('sparkNodeTree.getNode', { nodeId: 'root-table' }), 'nodeId')
    expectInvalidAlias(exec('sparkNodeTree.getLocation', { nodeId: 'name-field' }), 'nodeId')
    expectInvalidAlias(exec('sparkNodeTree.hasNode', { nodeId: 'name-field' }), 'nodeId')
    expectInvalidAlias(exec('sparkNodeTree.getParent', { nodeId: 'name-field' }), 'nodeId')
    expectInvalidAlias(exec('sparkNodeTree.listChildren', { parentId: 'root-table' }), 'parentId')
    expectInvalidAlias(exec('sparkNodeTree.addNode', {
      parentId: 'root-table',
      node: {
        type: 'r-text',
        id: 'legacy-a',
        props: { field: 'email', label: '邮箱' },
      },
    }), 'parentId')
    expectInvalidAlias(exec('sparkNodeTree.addNodes', {
      parentId: 'root-table',
      nodes: [
        { type: 'r-text', id: 'legacy-b', props: { field: 'mobile', label: '手机号' } },
        { type: 'r-text', id: 'legacy-c', props: { field: 'title', label: '职位' } },
      ],
    }), 'parentId')
    expectInvalidAlias(exec('sparkNodeTree.setProps', {
      nodeId: 'name-field',
      props: { class: 'legacy-a' },
      merge: true,
    }), 'nodeId')
    expectInvalidAlias(exec('sparkNodeTree.setPropsBatch', {
      items: [
        { nodeId: 'name-field', props: { class: 'legacy-b' }, merge: true },
      ],
    }), 'nodeId')
    expectInvalidAlias(exec('sparkNodeTree.replaceNode', {
      nodeId: 'name-field',
      node: {
        type: 'r-text',
        id: 'name-field',
        props: { field: 'position', label: '岗位' },
      },
    }), 'nodeId')
    expectInvalidAlias(exec('sparkNodeTree.replaceNodes', {
      items: [
        {
          nodeId: 'name-field',
          node: { type: 'r-text', id: 'name-field', props: { field: 'city', label: '城市' } },
        },
      ],
    }), 'nodeId')
    expectInvalidAlias(exec('sparkNodeTree.removeNode', { nodeId: 'name-field' }), 'nodeId')
    expectInvalidAlias(exec('sparkNodeTree.removeNodes', { nodeIds: ['name-field'] }), 'nodeIds')
  })
})
