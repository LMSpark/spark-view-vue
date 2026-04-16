import { mount } from '@vue/test-utils'
import type { ComponentMountingOptions } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { PAGE_COMPONENT_REGISTRY, PAGE_DATASET, Spark, useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'
import type { IDataSet, DataView } from '@spark-view/spark-data'
import type { PageComponentRegistry } from '../../packages/spark-component/src/core/capabilities'
import { createPageComponentRegistry } from '../../packages/spark-component/src/page/context/page-component-registry'

type MountedWithPageDataSetWrapper = VueWrapper<any> & {
  __pageComponentRegistry?: PageComponentRegistry
}

interface MountWithPageDataSetOptions {
  dataSet: IDataSet
  props?: Record<string, unknown>
  global?: ComponentMountingOptions<unknown>['global']
  slots?: Record<string, unknown>
}

export function mountWithPageDataSet(
  component: unknown,
  options: MountWithPageDataSetOptions,
) : MountedWithPageDataSetWrapper {
  const registry = Spark.createRegistry()
  const plugin = Spark.createPlugin({ registry })
  const pageComponentRegistry = createPageComponentRegistry()

  const Harness = defineComponent({
    setup() {
      const { sparkProvide } = useSparkComponent({ type: 'test-page-root' } as SparkNode)
      sparkProvide(PAGE_DATASET, options.dataSet)
      sparkProvide(PAGE_COMPONENT_REGISTRY, pageComponentRegistry)
      return () => h(component as never, options.props ?? {}, options.slots ?? {})
    },
  })

  const wrapper = mount(Harness, {
    global: {
      plugins: [plugin],
      ...options.global,
    },
  })

  const componentWrapper = wrapper.findComponent(component as never) as MountedWithPageDataSetWrapper
  componentWrapper.__pageComponentRegistry = pageComponentRegistry
  return componentWrapper
}

export function getMountedComponentApi<T>(
  wrapper: VueWrapper<any>,
  type: string,
  index = 0,
): T {
  const registry = (wrapper as MountedWithPageDataSetWrapper).__pageComponentRegistry
  if (!registry) {
    throw new Error('mountWithPageDataSet 未附带 PAGE_COMPONENT_REGISTRY。')
  }

  const apis = registry.getApisByType<T>(type)
  const api = apis[index]
  if (!api) {
    throw new Error(`未找到已注册的组件 API: type=${type}, index=${index}`)
  }
  return api
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
