import { computed } from 'vue'
import { describe, expect, it } from 'vitest'
import { useContainerInput } from '../packages/spark-component/src/renderer/containers/useContainerInput'

describe('useContainerInput - dataKey fallback order', () => {
  it('优先使用 config 顶层 dataKey（无需 bindRules 注入到 props）', () => {
    const config = {
      type: 'r-table',
      dataKey: 'Users@rows',
      props: {
        dataKey: 'Users@default@rows',
      },
    }

    const { effectiveDataKey } = useContainerInput({
      config: computed(() => config),
      dataKey: computed(() => 'Fallback@rows'),
      sparkChildren: computed(() => undefined),
    })

    expect(effectiveDataKey.value).toBe('Users@rows')
  })

  it('当顶层缺失时回退到 config.props.dataKey 与 props.dataKey', () => {
    const configWithoutTopLevel = {
      type: 'r-list',
      props: {
        dataKey: 'Orders@rows',
      },
    }

    const fromConfigProps = useContainerInput({
      config: computed(() => configWithoutTopLevel),
      dataKey: computed(() => 'Fallback@rows'),
      sparkChildren: computed(() => undefined),
    })

    expect(fromConfigProps.effectiveDataKey.value).toBe('Orders@rows')

    const fromProps = useContainerInput({
      config: computed(() => ({ type: 'r-list' })),
      dataKey: computed(() => 'Fallback@rows'),
      sparkChildren: computed(() => undefined),
    })

    expect(fromProps.effectiveDataKey.value).toBe('Fallback@rows')
  })

  it('configChildren 支持回退到 config.props.sparkChildren', () => {
    const field = { type: 'r-text', field: 'name' }
    const config = {
      type: 'r-form',
      props: {
        sparkChildren: [field],
      },
    }

    const { configChildren } = useContainerInput({
      config: computed(() => config),
      dataKey: computed(() => undefined),
      sparkChildren: computed(() => undefined),
    })

    expect(configChildren.value).toHaveLength(1)
    expect(configChildren.value[0]).toEqual(field)
  })
})
