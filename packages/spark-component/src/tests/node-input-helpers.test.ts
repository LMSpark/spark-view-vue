import { describe, expect, it } from 'vitest'
import { nodeInputProp, nodeInputProps, type SparkNode } from '../types'

describe('SparkNode input helpers', () => {
  it('nodeInputProp should read props first and then root-level compatibility fields', () => {
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

  it('nodeInputProp should map legacy name to field when field is absent', () => {
    const node = {
      type: 'r-number',
      name: 'legacy-id',
    } as SparkNode & Record<string, unknown>

    expect(nodeInputProp(node, 'field')).toBe('legacy-id')
  })

  it('nodeInputProps should merge root-level inputs into props while excluding structural keys', () => {
    const node = {
      type: 'r-step',
      id: 'step-1',
      dock: 'toolbar',
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
    expect(merged['name']).toBe('step-one')
    expect(merged['gridGap']).toBe(16)
    expect(merged['status']).toBe('process')
    expect(merged['id']).toBeUndefined()
    expect(merged['dock']).toBeUndefined()
    expect(merged['order']).toBeUndefined()
    expect(merged['children']).toBeUndefined()
    expect(merged['type']).toBeUndefined()
  })
})