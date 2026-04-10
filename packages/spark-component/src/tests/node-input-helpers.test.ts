import { describe, expect, it } from 'vitest'
import { nodeInputProp, nodeInputProps, type SparkNode } from '../core/types'

describe('SparkNode input helpers', () => {
  it('nodeInputProp should only read props', () => {
    const node: SparkNode & Record<string, unknown> = {
      type: 'r-text',
      field: 'root-field',
      props: {
        field: 'props-field',
        label: '姓名',
      },
      label: '根级标签',
    }

    expect(nodeInputProp(node, 'field')).toBe('props-field')
    expect(nodeInputProp(node, 'label')).toBe('姓名')
  })

  it('nodeInputProp should ignore root-level compatibility fields', () => {
    const node = {
      type: 'r-number',
      name: 'legacy-id',
      field: 'root-field',
    } as SparkNode & Record<string, unknown>

    expect(nodeInputProp(node, 'field')).toBeUndefined()
    expect(nodeInputProp(node, 'name')).toBeUndefined()
  })

  it('nodeInputProps should only return props and exclude structural keys', () => {
    const node = {
      type: 'r-step',
      id: 'step-1',
      order: 2,
      title: '步骤一',
      name: 'step-one',
      gridGap: 16,
      props: {
        title: 'props title wins',
        status: 'process',
      },
      children: [],
    } as SparkNode & Record<string, unknown>

    const merged = nodeInputProps(node)

    expect(merged['title']).toBe('props title wins')
    expect(merged['status']).toBe('process')
    expect(merged['name']).toBeUndefined()
    expect(merged['gridGap']).toBeUndefined()
    expect(merged['id']).toBeUndefined()
    expect(merged['order']).toBeUndefined()
    expect(merged['children']).toBeUndefined()
    expect(merged['type']).toBeUndefined()
  })

})