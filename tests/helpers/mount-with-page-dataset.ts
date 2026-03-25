import { mount } from '@vue/test-utils'
import type { ComponentMountingOptions } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { PAGE_DATASET, Spark, useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
import type { IDataSet, DataView } from '@spark-view/spark-data'

interface MountWithPageDataSetOptions {
  dataSet: IDataSet
  props?: Record<string, unknown>
  global?: ComponentMountingOptions<unknown>['global']
  slots?: Record<string, unknown>
}

export function mountWithPageDataSet(
  component: unknown,
  options: MountWithPageDataSetOptions,
): VueWrapper<any> {
  const registry = Spark.createRegistry()
  const plugin = Spark.createPlugin({ registry })

  const Harness = defineComponent({
    setup() {
      const { sparkProvide } = useSparkComponent({ type: 'test-page-root' } as SparkNode)
      sparkProvide(PAGE_DATASET, options.dataSet)
      return () => h(component as never, options.props ?? {}, options.slots ?? {})
    },
  })

  const wrapper = mount(Harness, {
    global: {
      plugins: [plugin],
      ...options.global,
    },
  })

  return wrapper.findComponent(component as never) as VueWrapper<any>
}

interface MountWithDataViewOptions {
  view: DataView
  field?: 'rows' | 'currentRow'
  props?: Record<string, unknown>
  global?: ComponentMountingOptions<unknown>['global']
  slots?: Record<string, unknown>
}

export function mountWithDataView(
  component: unknown,
  options: MountWithDataViewOptions,
) {
  const dataSet = options.view.dataSet
  if (!dataSet) {
    throw new Error('mountWithDataView 仅支持已附着到 DataSet 的 DataView。')
  }

  const field = options.field ?? 'rows'
  const dataKey = `${options.view.tableName}@${options.view.viewId}@${field}`

  const mountOptions: MountWithPageDataSetOptions = {
    dataSet,
    props: {
      ...options.props,
      dataKey,
    },
  }

  if (options.global) {
    mountOptions.global = options.global
  }
  if (options.slots) {
    mountOptions.slots = options.slots
  }

  return mountWithPageDataSet(component, mountOptions)
}
