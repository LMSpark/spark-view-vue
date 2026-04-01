import { describe, expect, it } from 'vitest'
import { SparkData } from '@spark-view/spark-data'
import { resolveViewFromDataKey } from '../packages/spark-component/src/shared/data-key-resolver'

describe('spark-component dataKey resolver', () => {
  function createDataSet() {
    return SparkData.createDataSet({
      dataSetName: 'ResolverDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }],
            },
          },
        },
      },
    })
  }

  it('returns the target view for valid keys', () => {
    const dataSet = createDataSet()
    const view = resolveViewFromDataKey('Users@rows', dataSet)

    expect(view).toBe(dataSet.getView('Users', 'default'))
  })

  it('accepts non-rows field keys and still resolves the owning view', () => {
    const dataSet = createDataSet()
    const view = resolveViewFromDataKey('Users@currentRow', dataSet)

    expect(view).toBe(dataSet.getView('Users', 'default'))
  })

  it('returns null for missing dataset, empty key, or invalid keys', () => {
    const dataSet = createDataSet()

    expect(resolveViewFromDataKey(undefined, dataSet)).toBeNull()
    expect(resolveViewFromDataKey('', dataSet)).toBeNull()
    expect(resolveViewFromDataKey('Users', dataSet)).toBeNull()
    expect(resolveViewFromDataKey('Missing@rows', dataSet)).toBeNull()
    expect(resolveViewFromDataKey('Users@invalidField', dataSet)).toBeNull()
    expect(resolveViewFromDataKey('Users@rows', null)).toBeNull()
  })
})