import { computed } from 'vue'
import { describe, expect, it } from 'vitest'
import { useContainerInput } from '../packages/spark-component/src/renderer/containers/useContainerInput'

describe('useContainerInput - dataKey & children from props', () => {
  it('直接使用 props.dataKey', () => {
    const { effectiveDataKey } = useContainerInput({
      dataKey: computed(() => 'Users@rows'),
      children: computed(() => undefined),
    })

    expect(effectiveDataKey.value).toBe('Users@rows')
  })

  it('props.dataKey 为 undefined 时 effectiveDataKey 也为 undefined', () => {
    const { effectiveDataKey } = useContainerInput({
      dataKey: computed(() => undefined),
      children: computed(() => undefined),
    })

    expect(effectiveDataKey.value).toBeUndefined()
  })

  it('configChildren 直接读取 props.children', () => {
    const field = { type: 'r-text', props: { field: 'name' } }
    const { configChildren } = useContainerInput({
      dataKey: computed(() => undefined),
      children: computed(() => [field]),
    })

    expect(configChildren.value).toHaveLength(1)
    expect(configChildren.value[0]).toEqual(field)
  })

  it('children 为 undefined 时返回空数组', () => {
    const { configChildren } = useContainerInput({
      dataKey: computed(() => undefined),
      children: computed(() => undefined),
    })

    expect(configChildren.value).toEqual([])
  })
})
