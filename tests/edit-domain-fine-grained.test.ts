import { beforeEach, describe, expect, it } from 'vitest'
import {
  bindLiveModelAdapter,
  clearDomains,
  clearRegistry,
  createSession,
  executeStill,
  getEditState,
  registerEditStills,
  type IStillSession,
  type StillResult,
} from '../packages/spark-ai/src/stills'
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
  return executeStill(action, params, session, `edit-${seq}`)
}

function expectActionUnavailable(action: string, params: unknown = {}): void {
  const result = exec(action, params)
  expect(result.ok).toBe(false)
}

const DISABLED_EDIT_ACTIONS = [
  'edit.changedLines',
  'edit.exportFiles',
  'dataset.export',
] as const

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerEditStills()
  session = createSession()
  seq = 0
  liveTree = new SparkNodeTree({ root: { type: 'page', children: [] } })
  liveDataSet = DataSetCrudTool.fromJson({ dataSetName: 'PageDataSet', tables: {} })
  script = ''
  style = ''

  // edit.bootstrap 现在强制要求同时存在 live NodeTree/DataSetTool 绑定。
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

describe('edit domain fine-grained flow', () => {
  it('disables changedLines/export actions in edit domain', () => {
    for (const action of DISABLED_EDIT_ACTIONS) {
      expectActionUnavailable(action)
    }
  })

  it('uses top-level id as the sparkNodeTree componentId standard', () => {
    const bootstrapPayload = {
      ruleJson: [{ id: 'root-table', type: 'r-table', props: { dataKey: 'Users@default' }, children: [] }],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    }
    seedLiveModel(bootstrapPayload)

    const init = exec('edit.bootstrap', bootstrapPayload)
    expect(init.ok).toBe(true)

    const hasRoot = exec('sparkNodeTree.hasNode', { componentId: 'root-table' })
    expect(hasRoot.ok).toBe(true)
    if (!hasRoot.ok) return
    expect(hasRoot.data).toBe(true)

    const addNode = exec('sparkNodeTree.addNode', {
      parentComponentId: 'root-table',
      node: {
        type: 'r-text',
        id: 'dept-name-field',
        props: { field: 'name', label: '部门名称' },
      },
    })
    expect(addNode.ok).toBe(true)

    const hasChild = exec('sparkNodeTree.hasNode', { componentId: 'dept-name-field' })
    expect(hasChild.ok).toBe(true)
    if (!hasChild.ok) return
    expect(hasChild.data).toBe(true)
  })

  it('bootstrap no longer compares payload with the current live model', () => {
    seedLiveModel({
      ruleJson: [{ id: 'root-table', type: 'r-table', props: { dataKey: 'Users@default' }, children: [] }],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    })

    const result = exec('edit.bootstrap', {
      ruleJson: [],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    })

    expect(result.ok).toBe(true)
  })

  it('binds live model tools directly without edit.bootstrap copies', () => {
    const liveTree = new SparkNodeTree({
      root: {
        type: 'page',
        children: [{ id: 'root-table', type: 'r-table', props: { dataKey: 'Users@default' }, children: [] }],
      },
    })
    const liveDataSet = DataSetCrudTool.fromJson({ dataSetName: 'PageDataSet', tables: {} })
    let script = 'export default {}\n'
    let style = '.page {}\n'

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

    const addTable = exec('datasetTool.createTable', {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
    })
    expect(addTable.ok).toBe(true)
    expect(liveDataSet.toJson().tables['Users']).toBeDefined()

    const scriptWrite = exec('textModel.writeScript', { content: 'export default { live: true }\n' })
    expect(scriptWrite.ok).toBe(true)
    expect(script).toContain('live: true')

    const styleWrite = exec('textModel.writeStyle', { content: '.page { color: red; }\n' })
    expect(styleWrite.ok).toBe(true)
    expect(style).toContain('color: red')

    const addNode = exec('sparkNodeTree.addNode', {
      parentComponentId: 'root-table',
      node: { type: 'r-text', id: 'name-field', props: { field: 'name' } },
    })
    expect(addNode.ok).toBe(true)
    expect(JSON.stringify(liveTree.toJSON().children)).toContain('name-field')
  })

  it('supports single-session fine-grained flow without export actions', () => {
    const bootstrapPayload = {
      ruleJson: [{ id: 'root-table', type: 'r-table', props: { dataKey: 'Users@default' }, children: [] }],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    }
    seedLiveModel(bootstrapPayload)

    const init = exec('edit.bootstrap', bootstrapPayload)
    expect(init.ok).toBe(true)

    const addTable = exec('datasetTool.createTable', {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
    })
    expect(addTable.ok).toBe(true)

    const scriptWrite = exec('textModel.writeScript', { content: 'export default { immediate: true }\n' })
    expect(scriptWrite.ok).toBe(true)

    const blockedRawExport = exec('datasetTool.export')
    expect(blockedRawExport.ok).toBe(false)
    if (!blockedRawExport.ok) {
      expect(blockedRawExport.code).toBe('INVALID_PARAMS')
    }

    expectActionUnavailable('edit.exportFiles')
    expectActionUnavailable('dataset.changedLines')
    expectActionUnavailable('dataset.export')

    const addColumn = exec('datasetTool.createColumn', {
      tableName: 'Users',
      column: { name: 'email', type: 'string' },
    })
    expect(addColumn.ok).toBe(true)

    const scriptWriteAfterDatasetChange = exec('textModel.writeScript', { content: 'export default { okAfterDatasetChange: true }\n' })
    expect(scriptWriteAfterDatasetChange.ok).toBe(true)

    const undo = exec('datasetTool.undo')
    expect(undo.ok).toBe(true)

    expect(liveDataSet.toJson().tables['Users']).toBeDefined()
    expect(script).toContain('okAfterDatasetChange')
  })

  it('deleteRelation single-signature regression (zero backward-compat)', () => {
    const liveTree = new SparkNodeTree({ root: { type: 'page', children: [] } })
    let script = ''
    let style = ''
    const seededDataSet = DataSetCrudTool.fromJson({
      dataSetName: 'TestDS',
      tables: {
        Department: {
          columns: [{ name: 'deptId', type: 'number', isPrimaryKey: true }],
          views: { default: { columns: ['deptId'] } },
        },
        Employee: {
          columns: [
            { name: 'empId', type: 'number', isPrimaryKey: true },
            { name: 'deptId', type: 'number' },
          ],
          views: { default: { columns: ['empId', 'deptId'] } },
        },
      },
      tableRelations: [
        {
          relationName: 'DeptToEmp',
          parentTable: 'Department',
          childTable: 'Employee',
          parentField: 'deptId',
          childField: 'deptId',
        },
      ],
      viewDependencies: [],
    })
    bindLiveModelAdapter(getEditState(session), {
      getNodeTree: () => liveTree,
      getDataSetTool: () => seededDataSet,
      readScript: () => script,
      writeScript(content) {
        script = content
      },
      readStyle: () => style,
      writeStyle(content) {
        style = content
      },
    })

    liveTree.loadRoot({ type: 'page', children: [] })
    seededDataSet.replaceFromJson(seededDataSet.toJson(), { commitHistory: false })
    script = 'export default {}\n'
    style = '.page {}\n'

    // 初始化时已经包含表和关系，但没有视图依赖（避免约束冲突）
    const init = exec('edit.bootstrap', {
      ruleJson: [],
      pageDataJson: seededDataSet.toJson(),
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    })
    expect(init.ok).toBe(true)

    // 验证删除关系前 pagedata 包含关系名
    expect(JSON.stringify(seededDataSet.toJson())).toContain('DeptToEmp')

    // 现在删除关系 - 使用新的单一签名（零向后兼容性）
    const deleteRel = exec('datasetTool.deleteRelation', {
      parentTable: 'Department',
      childTable: 'Employee',
      parentField: 'deptId',
      childField: 'deptId',
    })
    expect(deleteRel.ok).toBe(true)

    // 直接读取 live dataset 验证关系不再存在
    const dataAfter = JSON.stringify(seededDataSet.toJson())
    expect(dataAfter).not.toContain('DeptToEmp')
    expect(dataAfter).toContain('"Department"')
    expect(dataAfter).toContain('"Employee"')
  })
})
