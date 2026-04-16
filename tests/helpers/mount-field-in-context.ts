import { mount } from '@vue/test-utils'
import type { ComponentMountingOptions } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import {
  DATA_ROW,
  DATA_SOURCE,
  HOST_FIELD_MODE,
  PAGE_SERVICE,
  PAGE_DATASET,
  SPARK_REGISTRY_KEY,
  Spark,
  useSparkComponent,
} from '@spark-view/spark-component'
import type { SparkNode, SparkCapabilityContext, ComponentRegistry, IPageServiceCapability } from '@spark-view/spark-component'
import type { IDataRow, IDataSet } from '@spark-view/spark-data'

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
  hostType?: string | undefined
}

interface SparkTestSystem {
  registry: ComponentRegistry
  rootContext: SparkCapabilityContext
}

function resolveFieldModeByHostType(type: string): string {
  if (type === 'r-table') return 'table'
  if (type === 'r-form' || type === 'r-field-scope') return 'form'
  if (type === 'r-tree') return 'tree'
  return 'detail'
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
      const hostType = options.hostType ?? 'r-form'
      const { sparkProvide, host } = useSparkComponent({ type: hostType } as SparkNode, { hostContext: rootContext })
      host.setHost({})
      sparkProvide(HOST_FIELD_MODE, resolveFieldModeByHostType(hostType))
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