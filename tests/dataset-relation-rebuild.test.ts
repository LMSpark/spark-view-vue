import { describe, expect, it } from 'vitest'

import { DataSet } from '@spark-view/spark-data'

describe('DataSet relation rebuild', () => {
  it('fromJson 在关系图就绪后补挂级联订阅', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'PageDataSet',
      tables: {
        Departments: {
          columns: [{ name: 'id', type: 'number' }],
          views: {
            default: {
              rows: [{ id: 1 }, { id: 2 }],
            },
          },
        },
        Employees: {
          columns: [
            { name: 'id', type: 'number' },
            { name: 'deptId', type: 'number' },
          ],
          views: {
            default: {
              rows: [
                { id: 101, deptId: 1 },
                { id: 102, deptId: 2 },
              ],
            },
          },
        },
      },
      tableRelations: [
        { parentTable: 'Departments', childTable: 'Employees', parentField: 'id', childField: 'deptId' },
      ],
      viewDependencies: [
        {
          id: 'employees-by-department',
          targetViewKey: 'Employees@default',
          sources: [{ id: 'departments', type: 'view', viewKey: 'Departments@default' }],
          bindings: [{ sourceId: 'departments', sourceField: 'id', targetField: 'deptId' }],
        },
      ],
    })

    const parent = ds.getView('Departments', 'default')
    const child = ds.getView('Employees', 'default')

    expect(parent).toBeDefined()
    expect(child).toBeDefined()
    expect(child?.rows).toHaveLength(2)

    parent?.selection.setCurrentRow(parent.rows[1] ?? null)

    expect(child?.rows).toHaveLength(1)
    expect(child?.rows[0]).toMatchObject({ id: 102, deptId: 2 })
  })

  it('运行期 addRelation/addDependency 会重建内部关系图', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'RuntimeRelationDataSet',
      tables: {
        Departments: {
          tableName: 'Departments',
          columns: [{ name: 'id', type: 'number' }],
          views: {
            default: {
              rows: [{ id: 1 }, { id: 2 }],
            },
          },
        },
        Employees: {
          tableName: 'Employees',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'deptId', type: 'number' },
          ],
          views: {
            default: {
              rows: [
                { id: 101, deptId: 1 },
                { id: 102, deptId: 2 },
              ],
            },
          },
        },
      },
    })

    ds.addRelation({
      parentTable: 'Departments',
      childTable: 'Employees',
      parentField: 'id',
      childField: 'deptId',
    })
    ds.addDependency({
      id: 'employees-by-department',
      targetViewKey: 'Employees@default',
      sources: [{ id: 'departments', type: 'view', viewKey: 'Departments@default' }],
      bindings: [{ sourceId: 'departments', sourceField: 'id', targetField: 'deptId' }],
    })

    const parent = ds.getView('Departments', 'default')
    const child = ds.getView('Employees', 'default')

    expect(parent).toBeDefined()
    expect(child).toBeDefined()
    expect(child?.rows).toHaveLength(2)

    parent?.selection.setCurrentRow(parent.rows[0] ?? null)

    expect(child?.rows).toHaveLength(1)
    expect(child?.rows[0]).toMatchObject({ id: 101, deptId: 1 })
  })
})