import { describe, expect, it } from 'vitest'

import componentCatalogDocumentJson from '../src/services/page-design/payload/component-catalog.json'
import {
  createSparkComponentCatalogProvider,
  readSparkComponentCatalogDocument,
  SPARK_COMPONENT_PAYLOAD_REF,
} from '../src/services/page-design/spark-component-catalog-provider'

describe('spark-component-catalog-provider', () => {
  it('lists configurable components and guides r-form SparkNode schema', () => {
    const catalog = readSparkComponentCatalogDocument(componentCatalogDocumentJson)
    const provider = createSparkComponentCatalogProvider(catalog)

    const summaries = provider.queryPayloads({
      keyword: 'r-form',
      limit: 5,
    })
    expect(summaries.some(item => item.key === 'r-form')).toBe(true)
    expect(summaries.every(item => item.payloadRef === SPARK_COMPONENT_PAYLOAD_REF)).toBe(true)

    const guide = provider.guidePayload('r-form')
    expect(guide).not.toBeNull()
    expect(guide?.paramsSchema.properties?.['type']).toMatchObject({ const: 'r-form' })
    expect(guide?.paramsSchema.properties?.['props']).toMatchObject({ type: 'object' })

    expect(provider.guidePayload('about')).toBeNull()
  })
})
