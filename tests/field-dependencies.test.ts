import { describe, expect, it } from 'vitest'

import { DataSet, DataSetCrudTool, type FieldDependency, type IDataRow, type ViewDependency } from '@spark-view/spark-data'

const citiesByRegion: ViewDependency = {
  id: 'cities-by-region',
  targetViewKey: 'Cities@byRegion',
  sources: [
    {
      id: 'address',
      type: 'fields',
      viewKey: 'Address@editor',
      scope: 'editContext',
      fields: ['countryId', 'provinceId'],
    },
  ],
  bindings: [
    { sourceId: 'address', sourceField: 'countryId', targetField: 'countryId', required: true },
    { sourceId: 'address', sourceField: 'provinceId', targetField: 'provinceId', required: true },
  ],
  autoLoad: true,
  emptyPolicy: 'clearRows',
}

const districtsByCity: ViewDependency = {
  id: 'districts-by-city',
  targetViewKey: 'Districts@byCity',
  sources: [
    {
      id: 'address',
      type: 'fields',
      viewKey: 'Address@editor',
      scope: 'editContext',
      fields: ['cityId'],
    },
  ],
  bindings: [
    { sourceId: 'address', sourceField: 'cityId', targetField: 'cityId', required: true },
  ],
  autoLoad: true,
  emptyPolicy: 'clearRows',
}

const cityFieldDependency: FieldDependency = {
  field: 'cityId',
  dependsOn: ['countryId', 'provinceId'],
  optionDependencyId: 'cities-by-region',
  valuePolicy: 'clear',
  clearAlso: ['districtId', 'cityName'],
  lookup: {
    viewKey: 'Cities@byRegion',
    matchField: 'id',
    map: { cityName: 'name', cityCode: 'code' },
  },
}

const districtFieldDependency: FieldDependency = {
  field: 'districtId',
  dependsOn: ['cityId'],
  optionDependencyId: 'districts-by-city',
  valuePolicy: 'clear',
}

function createDataSet(fieldDependencies: FieldDependency[] = [cityFieldDependency, districtFieldDependency]) {
  const row: IDataRow = {
    id: 1,
    countryId: 'cn',
    provinceId: 'zj',
    cityId: 'hz',
    districtId: 'xh',
    cityName: '杭州',
    cityCode: 'HZ',
  }

  const ds = DataSet.fromJson({
    dataSetName: 'FieldDependencyDS',
    tables: {
      Address: {
        tableName: 'Address',
        columns: [
          { name: 'id', type: 'number' },
          { name: 'countryId', type: 'string' },
          { name: 'provinceId', type: 'string' },
          { name: 'cityId', type: 'string' },
          { name: 'districtId', type: 'string' },
          { name: 'cityName', type: 'string' },
          { name: 'cityCode', type: 'string' },
        ],
        views: {
          default: { rows: [row] },
          editor: { rows: [row], fieldDependencies },
        },
      },
      Cities: {
        tableName: 'Cities',
        resourceType: 'static-data',
        columns: [
          { name: 'id', type: 'string' },
          { name: 'countryId', type: 'string' },
          { name: 'provinceId', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'code', type: 'string' },
        ],
        views: {
          default: {
            rows: [
              { id: 'hz', countryId: 'cn', provinceId: 'zj', name: '杭州', code: 'HZ' },
              { id: 'nb', countryId: 'cn', provinceId: 'zj', name: '宁波', code: 'NB' },
              { id: 'sh', countryId: 'cn', provinceId: 'sh', name: '上海', code: 'SH' },
            ],
          },
          byRegion: { rows: [] },
        },
      },
      Districts: {
        tableName: 'Districts',
        resourceType: 'static-data',
        columns: [
          { name: 'id', type: 'string' },
          { name: 'cityId', type: 'string' },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: {
            rows: [
              { id: 'xh', cityId: 'hz', name: '西湖' },
              { id: 'bh', cityId: 'nb', name: '北仑' },
            ],
          },
          byCity: { rows: [] },
        },
      },
    },
    viewDependencies: [citiesByRegion, districtsByCity],
  })

  return { ds, row }
}

describe('fieldDependencies projected to viewDependencies', () => {
  it('round-trips fieldDependencies and viewDependencies through DataSet serialization and CRUD tool helpers', () => {
    const { ds } = createDataSet([cityFieldDependency])

    expect(ds.toJson().tables['Address']?.views['editor']?.fieldDependencies).toEqual([cityFieldDependency])
    expect(ds.toJson().viewDependencies).toEqual([citiesByRegion, districtsByCity])

    const tool = new DataSetCrudTool('ToolDS')
    tool.replaceFromJson(ds.toJson())

    expect(tool.listFieldDependencies({ tableName: 'Address', viewId: 'editor' })).toEqual([cityFieldDependency])
    expect(tool.getFieldDependency({ tableName: 'Address', viewId: 'editor', field: 'cityId' })).toEqual(cityFieldDependency)

    tool.addFieldDependency({
      tableName: 'Address',
      viewId: 'editor',
      dependency: districtFieldDependency,
    })
    expect(tool.listFieldDependencies({ tableName: 'Address', viewId: 'editor' })).toHaveLength(2)

    tool.updateFieldDependency({
      tableName: 'Address',
      viewId: 'editor',
      field: 'districtId',
      updates: { valuePolicy: 'keepIfValid' },
    })
    expect(tool.getFieldDependency({ tableName: 'Address', viewId: 'editor', field: 'districtId' })?.valuePolicy).toBe('keepIfValid')

    tool.removeFieldDependency({ tableName: 'Address', viewId: 'editor', field: 'districtId' })
    expect(tool.getFieldDependency({ tableName: 'Address', viewId: 'editor', field: 'districtId' })).toBeUndefined()

    const newDependency: ViewDependency = {
      ...citiesByRegion,
      id: 'cities-by-region-copy',
      targetViewKey: 'Cities@byRegion',
    }
    tool.createDependency({ dependency: newDependency })
    expect(tool.getDependency({ id: 'cities-by-region-copy' })).toEqual(newDependency)
    tool.updateDependency({ id: 'cities-by-region-copy', updates: { autoLoad: false } })
    expect(tool.getDependency({ id: 'cities-by-region-copy' })?.autoLoad).toBe(false)
    tool.deleteDependency({ id: 'cities-by-region-copy' })
    expect(tool.getDependency({ id: 'cities-by-region-copy' })).toBeUndefined()
  })

  it('clears downstream draft fields and filters option DataViews by multiple parent fields', async () => {
    const { ds, row } = createDataSet()

    row['provinceId'] = 'zj'
    await ds.notifyFieldChanged({ viewKey: 'Address@editor', row, field: 'provinceId' })

    expect(row['cityId']).toBeNull()
    expect(row['districtId']).toBeNull()
    expect(row['cityName']).toBeNull()
    expect(ds.getView('Cities', 'byRegion')?.rows.map(item => item['id'])).toEqual(['hz', 'nb'])
    expect(ds.getView('Districts', 'byCity')?.rows).toEqual([])
  })

  it('clears target option rows when a required parent field is empty', async () => {
    const { ds, row } = createDataSet()

    row['provinceId'] = null
    await ds.notifyFieldChanged({ viewKey: 'Address@editor', row, field: 'provinceId' })

    expect(ds.getView('Cities', 'byRegion')?.rows).toEqual([])
  })

  it('projects selected option rows back to label/code fields', async () => {
    const { ds, row } = createDataSet()

    row['cityId'] = null
    await ds.notifyFieldChanged({ viewKey: 'Address@editor', row, field: 'provinceId' })
    row['cityId'] = 'nb'
    await ds.notifyFieldChanged({ viewKey: 'Address@editor', row, field: 'cityId' })

    expect(row['cityName']).toBe('宁波')
    expect(row['cityCode']).toBe('NB')
    expect(ds.getView('Districts', 'byCity')?.rows.map(item => item['id'])).toEqual(['bh'])
  })

  it('awaits field source refresh before keepIfValid validation', async () => {
    const row: IDataRow = { id: 1, provinceId: 'zj', cityId: 'hz' }
    const ds = DataSet.fromJson({
      dataSetName: 'KeepIfValidDS',
      tables: {
        Address: {
          tableName: 'Address',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'provinceId', type: 'string' },
            { name: 'cityId', type: 'string' },
          ],
          views: {
            default: { rows: [row] },
            editor: {
              rows: [row],
              fieldDependencies: [
                {
                  field: 'cityId',
                  dependsOn: ['provinceId'],
                  valuePolicy: 'keepIfValid',
                  lookup: { viewKey: 'Cities@byRegion', matchField: 'id', map: {} },
                },
              ],
            },
          },
        },
        Cities: {
          tableName: 'Cities',
          columns: [
            { name: 'id', type: 'string' },
            { name: 'provinceId', type: 'string' },
          ],
          views: {
            default: { rows: [{ id: 'hz', provinceId: 'zj' }] },
            byRegion: { rows: [] },
          },
        },
      },
    })

    const cities = ds.getView('Cities', 'byRegion')!
    ds.subscribeFieldSource('Address@editor', 'editContext', 'provinceId', async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
      cities.replaceRows([{ id: 'hz', provinceId: 'zj' }])
    })

    await ds.notifyFieldChanged({ viewKey: 'Address@editor', row, field: 'provinceId' })

    expect(row['cityId']).toBe('hz')
  })

  it('stops recursive field dependency loops with the visited/depth guard', async () => {
    const { ds, row } = createDataSet([
      { field: 'cityId', dependsOn: ['districtId'], valuePolicy: 'clear' },
      { field: 'districtId', dependsOn: ['cityId'], valuePolicy: 'clear' },
    ])

    row['cityId'] = 'hz'
    row['districtId'] = 'xh'
    await ds.notifyFieldChanged({ viewKey: 'Address@editor', row, field: 'cityId' })

    expect(row['cityId']).toBeNull()
    expect(row['districtId']).toBeNull()
  })
})
