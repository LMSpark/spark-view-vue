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
  return executeStill(action, params, session, `edit-${seq}`)
}

beforeEach(() => {
  clearDomains()
  clearRegistry()
  registerEditStills()
  session = createSession()
  seq = 0
})

describe('edit domain fine-grained flow', () => {
  it('fails fast for changedLines before edit.init', () => {
    const result = exec('edit.changedLines')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('NOT_EDITING')
  })

  it('lands dataset-first fine-grained flow', () => {
    const init = exec('edit.init', {
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

    const baselineModel = exec('dataset.baselineModel')
    expect(baselineModel.ok).toBe(true)
    if (!baselineModel.ok) return
    expect((baselineModel.data as { tableNames: string[] }).tableNames).toEqual([])

    const currentModel = exec('dataset.currentModel')
    expect(currentModel.ok).toBe(true)
    if (!currentModel.ok) return
    expect((currentModel.data as { tableNames: string[] }).tableNames).toContain('Users')

    const modelDeltaAfterCreate = exec('dataset.modelDelta')
    expect(modelDeltaAfterCreate.ok).toBe(true)
    if (!modelDeltaAfterCreate.ok) return
    expect((modelDeltaAfterCreate.data as { addedTables: string[] }).addedTables).toContain('Users')

    const blockedScriptWrite = exec('file.writeScript', { content: 'export default { blocked: true }\n' })
    expect(blockedScriptWrite.ok).toBe(false)
    if (!blockedScriptWrite.ok) {
      expect(blockedScriptWrite.code).toBe('DATA_PHASE_REQUIRED')
    }

    const blockedRawExport = exec('datasetTool.export')
    expect(blockedRawExport.ok).toBe(false)
    if (!blockedRawExport.ok) {
      expect(blockedRawExport.code).toBe('INVALID_PARAMS')
    }

    const blockedEditExport = exec('edit.exportFiles')
    expect(blockedEditExport.ok).toBe(false)
    if (!blockedEditExport.ok) {
      expect(blockedEditExport.code).toBe('DATA_PHASE_REQUIRED')
    }

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

    const scriptWriteAfterExport = exec('file.writeScript', { content: 'export default { ok: true }\n' })
    expect(scriptWriteAfterExport.ok).toBe(true)

    // 迭代修改：再次改动数据后，必须重新 dataset.export 才能继续脚本/样式编辑。
    const addColumn = exec('datasetTool.createColumn', {
      tableName: 'Users',
      column: { name: 'email', type: 'string' },
    })
    expect(addColumn.ok).toBe(true)

    const blockedScriptAfterSecondDatasetChange = exec('file.writeScript', { content: 'export default { blockedAgain: true }\n' })
    expect(blockedScriptAfterSecondDatasetChange.ok).toBe(false)
    if (!blockedScriptAfterSecondDatasetChange.ok) {
      expect(blockedScriptAfterSecondDatasetChange.code).toBe('DATA_PHASE_REQUIRED')
    }

    const reExported = exec('dataset.export')
    expect(reExported.ok).toBe(true)

    const scriptWriteAfterReExport = exec('file.writeScript', { content: 'export default { okAfterReExport: true }\n' })
    expect(scriptWriteAfterReExport.ok).toBe(true)

    const undo = exec('datasetTool.undo')
    expect(undo.ok).toBe(true)

    const modelDeltaAfterUndo = exec('dataset.modelDelta')
    expect(modelDeltaAfterUndo.ok).toBe(true)
    if (!modelDeltaAfterUndo.ok) return
    const changedTables = (modelDeltaAfterUndo.data as {
      changedTables: Array<{ tableName: string; addedColumns: string[] }>
    }).changedTables
    const usersDelta = changedTables.find((item) => item.tableName === 'Users')
    expect(usersDelta?.addedColumns ?? []).not.toContain('email')

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

    const blockedEditExportAfterUndo = exec('edit.exportFiles')
    expect(blockedEditExportAfterUndo.ok).toBe(false)
    if (!blockedEditExportAfterUndo.ok) {
      expect(blockedEditExportAfterUndo.code).toBe('DATA_PHASE_REQUIRED')
    }

    const finalDatasetExport = exec('dataset.export')
    expect(finalDatasetExport.ok).toBe(true)

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
    // 初始化时已经包含表和关系，但没有视图依赖（避免约束冲突）
    const init = exec('edit.init', {
      ruleJson: [],
      pageDataJson: {
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
        viewDependencies: [], // 确保没有视图依赖
      },
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

    // 检查 modelDelta 以验证关系删除被追踪
    const modelDelta = exec('dataset.modelDelta')
    expect(modelDelta.ok).toBe(true)
    if (!modelDelta.ok) return
    const delta = modelDelta.data as {
      removedRelations: string[]
    }
    
    // 关系应该出现在 removedRelations 中（即使是通过 parentTable.field->childTable.field 格式）
    expect(delta.removedRelations.length).toBeGreaterThan(0)
    expect(delta.removedRelations.some((rel) => rel.includes('Department') && rel.includes('Employee'))).toBe(true)

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
