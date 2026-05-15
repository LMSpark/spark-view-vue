import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import {
  PAGE_DATASET,
  SPARK_REGISTRY_KEY,
  Spark,
  useSparkComponent,
} from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import { useFieldOptions } from '../packages/spark-component/src/components/fields/options/useFieldOptions'

const OptionProbe = defineComponent({
  props: {
    optionKey: { type: String, required: true },
    sampleValue: { type: [String, Array], default: undefined },
  },
  setup(props) {
    const { options, formatOptionValue } = useFieldOptions(props)

    return () => {
      const firstOption = options.value[0]
      return h('div', {
        class: 'option-probe',
        'data-option-count': String(options.value.length),
        'data-first-label': String(firstOption?.label ?? ''),
        'data-first-value': String(firstOption?.value ?? ''),
        'data-formatted': formatOptionValue(props.sampleValue),
      })
    }
  },
})

function mountOptionProbe(dataSet: ReturnType<typeof SparkData.createDataSet>, sampleValue: unknown) {
  const { registry, rootContext } = Spark.createSystem()
  const normalizedSampleValue = Array.isArray(sampleValue)
    ? sampleValue.map(item => String(item))
    : typeof sampleValue === 'string'
      ? sampleValue
      : undefined

  const Provider = defineComponent({
    setup() {
      const { sparkProvide } = useSparkComponent({ type: 'r-form' } as never, { parentContext: rootContext })
      sparkProvide(PAGE_DATASET, dataSet)

      return () => h(OptionProbe as never, {
        optionKey: 'Dict@default@rows',
        sampleValue: normalizedSampleValue,
      } as never)
    },
  })

  return mount(Provider, {
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
      },
    },
  })
}

describe('选项字段应继承 DataView facets', () => {
  it('应默认使用 DataView.labelField/valueField/selectionDelimiter', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'DictDS',
      tables: {
        Dict: {
          tableName: 'Dict',
          columns: [
            { name: 'code', type: 'string' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [
                { code: 'A', name: '选项A' },
                { code: 'B', name: '选项B' },
              ],
              valueField: 'code',
              labelField: 'name',
              selectionDelimiter: '|',
            },
          },
        },
      },
    })

    const wrapper = mountOptionProbe(dataSet, 'A|B')
    const probe = wrapper.find('.option-probe')

    expect(probe.attributes('data-option-count')).toBe('2')
    expect(probe.attributes('data-first-label')).toBe('选项A')
    expect(probe.attributes('data-first-value')).toBe('A')
    expect(probe.attributes('data-formatted')).toBe('选项A / 选项B')
  })

  it('单选模式 selectionDelimiter 为空字符串时不应按字符拆分', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'SingleValueDS',
      tables: {
        Dict: {
          tableName: 'Dict',
          columns: [
            { name: 'code', type: 'string' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [
                { code: 'AB', name: '单值选项' },
              ],
              valueField: 'code',
              labelField: 'name',
              selectionDelimiter: '',
            },
          },
        },
      },
    })

    const wrapper = mountOptionProbe(dataSet, 'AB')
    const probe = wrapper.find('.option-probe')

    expect(probe.attributes('data-first-label')).toBe('单值选项')
    expect(probe.attributes('data-first-value')).toBe('AB')
    expect(probe.attributes('data-formatted')).toBe('单值选项')
  })
})