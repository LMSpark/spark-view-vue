import { beforeEach, describe, expect, it } from 'vitest'
import { clearRegistry, executeStill } from '../packages/spark-ai/src/core/stills/dispatcher'
import { clearDomains, createBareSession } from '../packages/spark-ai/src/core/stills/domain'
import type { IStillSession, StillResult } from '../packages/spark-ai/src/core/stills/types'
import { registerPageDesignEditStills } from '../packages/spark-ai/src/business/page-design/register-edit-stills'
import {
  bindLiveModelAdapter,
  getEditState,
} from '../packages/spark-ai/src/business/page-design/stills'
import { SparkNodeTree, type SparkNode } from '../packages/spark-component/src/index'
import { DataSetCrudTool, type IDataSetMetadata } from '../packages/spark-data/src/index'

let session: IStillSession
let seq = 0
let liveTree: SparkNodeTree
let liveDataSet: DataSetCrudTool
let script = ''
let style = ''

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
  registerPageDesignEditStills()
  session = createBareSession()
  seq = 0
  liveTree = new SparkNodeTree({ root: { type: 'page', children: [] } })
  liveDataSet = DataSetCrudTool.fromJson({ dataSetName: 'PageDataSet', tables: {} })
  script = ''
  style = ''
  bindLiveModelAdapter(getEditState(session), {
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
  })
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

describe('sparkNodeTree legacy alias compatibility', () => {
  it('rejects nodeId/nodeIds/parentId aliases across query and write actions', () => {
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
          ],
        },
      ],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    }
    seedLiveModel(bootstrapPayload)

    const init = exec('pageDesign@lifecycle@bootstrap')
    expect(init.ok).toBe(true)

    expectInvalidAlias(exec('pageDesign@nodeTree@getNode', { nodeId: 'root-table' }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@getLocation', { nodeId: 'name-field' }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@hasNode', { nodeId: 'name-field' }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@getParent', { nodeId: 'name-field' }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@listChildren', { parentId: 'root-table' }), 'parentId')
    expectInvalidAlias(exec('pageDesign@nodeTree@addNode', {
      parentId: 'root-table',
      node: {
        type: 'r-text',
        id: 'legacy-a',
        props: { field: 'email', label: '邮箱' },
      },
    }), 'parentId')
    expectInvalidAlias(exec('pageDesign@nodeTree@addNodes', {
      parentId: 'root-table',
      nodes: [
        { type: 'r-text', id: 'legacy-b', props: { field: 'mobile', label: '手机号' } },
        { type: 'r-text', id: 'legacy-c', props: { field: 'title', label: '职位' } },
      ],
    }), 'parentId')
    expectInvalidAlias(exec('pageDesign@nodeTree@moveNode', { nodeId: 'name-field', parentComponentId: 'root-table' }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@moveNode', { componentId: 'name-field', parentId: 'root-table' }), 'parentId')
    expectInvalidAlias(exec('pageDesign@nodeTree@setProps', {
      nodeId: 'name-field',
      props: { class: 'legacy-a' },
      merge: true,
    }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@setPropsBatch', {
      items: [
        { nodeId: 'name-field', props: { class: 'legacy-b' }, merge: true },
      ],
    }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@replaceNode', {
      nodeId: 'name-field',
      node: {
        type: 'r-text',
        id: 'name-field',
        props: { field: 'position', label: '岗位' },
      },
    }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@replaceNodes', {
      items: [
        {
          nodeId: 'name-field',
          node: { type: 'r-text', id: 'name-field', props: { field: 'city', label: '城市' } },
        },
      ],
    }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@removeNode', { nodeId: 'name-field' }), 'nodeId')
    expectInvalidAlias(exec('pageDesign@nodeTree@removeNodes', { nodeIds: ['name-field'] }), 'nodeIds')
  })
})
