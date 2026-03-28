import { mount } from '@vue/test-utils'
import type { ComponentMountingOptions } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import {
  DATA_ROW,
  DATA_SOURCE,
  PAGE_DATASET,
  SPARK_REGISTRY_KEY,
  Spark,
  useSparkComponent,
} from '@spark-view/spark-component'
import type { SparkNode, SparkCapabilityContext, ComponentRegistry } from '@spark-view/spark-component'
import type { IDataRow, IDataSet } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import type { IPageServiceCapability } from '@spark-view/spark-utils'

interface MountFieldInContextOptions {
  component: unknown
  type: string
  model: IDataRow
  fieldName: string
  componentProps?: Record<string, unknown> | undefined
  global?: ComponentMountingOptions<unknown>['global'] | undefined
  pageDataSet?: IDataSet | undefined
  dataSource?: unknown
  pageService?: IPageServiceCapability | undefined
  parentType?: string | undefined
}

interface SparkTestSystem {
  registry: ComponentRegistry
  rootContext: SparkCapabilityContext
}

function createTestSystem(): SparkTestSystem {
  return Spark.createSystem()
}

export function mountFieldInContext(options: MountFieldInContextOptions) {
  const { registry, rootContext } = createTestSystem()
  const globalOptions = options.global ?? {}
  const providedValues = globalOptions.provide ?? {}

  const Provider = defineComponent({
    setup() {
      const { sparkProvide } = useSparkComponent({ type: options.parentType ?? 'r-form' } as SparkNode, { parentContext: rootContext })
      sparkProvide(DATA_ROW, options.model)

      if (options.pageDataSet !== undefined) {
        sparkProvide(PAGE_DATASET, options.pageDataSet)
      }
      if (options.dataSource !== undefined) {
        sparkProvide(DATA_SOURCE, options.dataSource as never)
      }
      if (options.pageService !== undefined) {
        sparkProvide(PAGE_SERVICE, options.pageService)
      }

      return () => h(options.component as never, {
        type: options.type,
        field: options.fieldName,
        ...(options.componentProps ?? {}),
      })
    },
  })

  return mount(Provider, {
    global: {
      ...globalOptions,
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
        ...providedValues,
      },
    },
  })
}