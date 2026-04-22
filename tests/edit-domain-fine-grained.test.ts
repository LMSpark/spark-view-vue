import { beforeEach, describe, expect, it } from 'vitest'
import {
  bindLiveModelAdapter,
  captureBaselineSnapshot,
  clearDomains,
  clearRegistry,
  createSession,
  executeStill,
  getEditState,
  registerEditStills,
  type IStillSession,
  type StillResult,
} from '../packages/spark-ai/src/stills'
import { SparkNodeTree } from '../packages/spark-component/src/index'
import { DataSetCrudTool } from '../packages/spark-data/src/index'

let session: IStillSession
let seq = 0

function exec(action: string, params: unknown = {}): StillResult {
  seq += 1
  return executeStill(action, params, session, `edit-${seq}`)
}

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerEditStills()
  session = createSession()
  seq = 0
  const liveTree = new SparkNodeTree({ root: { type: 'page', children: [] } })
  const liveDataSet = DataSetCrudTool.fromJson({ dataSetName: 'PageDataSet', tables: {} })
  let script = ''
  let style = ''

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

describe('edit domain fine-grained flow', () => {
  it('returns zero changedLines before edit.bootstrap', () => {
    const result = exec('edit.changedLines')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({
      ruleJson: 0,
      pageDataJson: 0,
      scriptJs: 0,
      styleCss: 0,
      total: 0,
    })
  })

  it('uses top-level id as the sparkNodeTree componentId standard', () => {
    const init = exec('edit.bootstrap', {
      ruleJson: [{ id: 'root-table', type: 'r-table', props: { dataKey: 'Users@default' }, children: [] }],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    })
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
    captureBaselineSnapshot(getEditState(session))

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

    const changed = exec('edit.changedLines')
    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    const changedStats = changed.data as { total: number }
    expect(changedStats.total).toBeGreaterThan(0)

    const exported = exec('edit.exportFiles')
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    const exportData = exported.data as { files: Record<string, string> }
    expect(exportData.files['pagedata.json']).toContain('"Users"')
    expect(exportData.files['script.js']).toContain('live: true')
    expect(exportData.files['style.css']).toContain('color: red')
    expect(exportData.files['rule.json']).toContain('name-field')
  })

  it('supports single-session fine-grained flow without export gating', () => {
    const init = exec('edit.bootstrap', {
      ruleJson: [{ id: 'root-table', type: 'r-table', props: { dataKey: 'Users@default' }, children: [] }],
      pageDataJson: { dataSetName: 'PageDataSet', tables: {} },
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    })
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

    const editExport = exec('edit.exportFiles')
    expect(editExport.ok).toBe(true)
    if (!editExport.ok) return
    const editExportData = editExport.data as {
      files: Record<string, string>
      changedLines: { total: number }
    }
    expect(editExportData.files['pagedata.json']).toContain('"Users"')
    expect(editExportData.files['script.js']).toContain('immediate')
    expect(editExportData.changedLines.total).toBeGreaterThan(0)

    const datasetChanged = exec('dataset.changedLines')
    expect(datasetChanged.ok).toBe(true)
    if (!datasetChanged.ok) return
    const datasetStats = datasetChanged.data as { pagedataJson: number }
    expect(datasetStats.pagedataJson).toBeGreaterThan(0)

    const datasetExported = exec('dataset.export')
    expect(datasetExported.ok).toBe(true)
    if (!datasetExported.ok) return
    const datasetData = datasetExported.data as {
      file: Record<string, string>
      changedLines: { pagedataJson: number }
      tables: string[]
    }
    expect(datasetData.file['pagedata.json']).toContain('"Users"')
    expect(datasetData.changedLines.pagedataJson).toBeGreaterThan(0)
    expect(datasetData.tables).toContain('Users')

    const addColumn = exec('datasetTool.createColumn', {
      tableName: 'Users',
      column: { name: 'email', type: 'string' },
    })
    expect(addColumn.ok).toBe(true)

    const scriptWriteAfterDatasetChange = exec('textModel.writeScript', { content: 'export default { okAfterDatasetChange: true }\n' })
    expect(scriptWriteAfterDatasetChange.ok).toBe(true)

    const undo = exec('datasetTool.undo')
    expect(undo.ok).toBe(true)

    const changed = exec('edit.changedLines')
    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    const stats = changed.data as {
      ruleJson: number
      pageDataJson: number
      scriptJs: number
      styleCss: number
      total: number
    }
    expect(stats.pageDataJson).toBeGreaterThan(0)
    expect(stats.total).toBeGreaterThan(0)

    const exported = exec('edit.exportFiles')
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    const data = exported.data as {
      files: Record<string, string>
      changedLines: { total: number }
    }
    expect(data.files['pagedata.json']).toContain('"Users"')
    expect(data.files['script.js']).toContain('export default')
    expect(data.changedLines.total).toBeGreaterThan(0)
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

    // 初始化时已经包含表和关系，但没有视图依赖（避免约束冲突）
    const init = exec('edit.bootstrap', {
      ruleJson: [],
      pageDataJson: seededDataSet.toJson(),
      scriptJs: 'export default {}\n',
      styleCss: '.page {}\n',
    })
    expect(init.ok).toBe(true)

    // 验证删除关系前 pagedata 包含关系名
    const exportBefore = exec('dataset.export')
    expect(exportBefore.ok).toBe(true)
    if (!exportBefore.ok) return
    const dataBefore = exportBefore.data as { file: Record<string, string> }
    expect(dataBefore.file['pagedata.json']).toContain('DeptToEmp')

    // 现在删除关系 - 使用新的单一签名（零向后兼容性）
    const deleteRel = exec('datasetTool.deleteRelation', {
      parentTable: 'Department',
      childTable: 'Employee',
      parentField: 'deptId',
      childField: 'deptId',
    })
    expect(deleteRel.ok).toBe(true)

    // 导出验证关系不再存在
    const exported = exec('dataset.export')
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    const dataAfter = exported.data as { file: Record<string, string> }
    expect(dataAfter.file['pagedata.json']).not.toContain('DeptToEmp')
    expect(dataAfter.file['pagedata.json']).toContain('"Department"')
    expect(dataAfter.file['pagedata.json']).toContain('"Employee"')
  })
})
