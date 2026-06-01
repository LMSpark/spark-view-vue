import componentCatalog from '../payload/component-catalog.json'

type QueryPayloadArgs = {
  key?: unknown
  limit?: unknown
}

type ComponentCatalog = {
  components: Record<string, {
    type: string
    category?: string
    description?: string
    configurable?: boolean
    internal?: boolean
    props?: Array<{ name: string; schema?: unknown }>
  }>
}

function toPositiveLimit(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 20
}

function readCatalog(): ComponentCatalog {
  return componentCatalog as ComponentCatalog
}

export function hasPageDesignComponentPayloadKey(key: string): boolean {
  return readCatalog().components[key] !== undefined
}

function createParamsSchema(key: string): Record<string, unknown> {
  const catalog = readCatalog()
  const entry = catalog.components[key]
  const properties: Record<string, unknown> = {}
  for (const prop of entry?.props ?? []) {
    properties[prop.name] = prop.schema ?? true
  }
  return {
    type: 'object',
    properties,
    $defs: {
      SparkNode: { title: 'SparkNode', type: 'object' },
      'r-toolbar': { title: 'r-toolbar', type: 'object' },
      'r-filter': { title: 'r-filter', type: 'object' },
      'r-tail': { title: 'r-tail', type: 'object' },
    },
  }
}

export function createPageDesignPayloadRegistry() {
  return {
    requireProvider(moduleKind: string, payloadRef: string) {
      if (moduleKind !== 'node-tree' || payloadRef !== 'spark.component') {
        throw new Error(`Unknown payload provider: ${moduleKind}/${payloadRef}`)
      }
      return {
        guidePayload(key: string) {
          const entry = readCatalog().components[key]
          if (entry === undefined) return null
          return {
            moduleKind,
            payloadRef,
            key,
            paramsSchema: createParamsSchema(key),
          }
        },
        queryPayloads(args: QueryPayloadArgs) {
          const key = typeof args.key === 'string' ? args.key : ''
          const limit = toPositiveLimit(args.limit)
          return Object.values(readCatalog().components)
            .filter((entry) => key === '' || entry.type.includes(key))
            .slice(0, limit)
            .map((entry) => ({
              moduleKind,
              payloadRef,
              key: entry.type,
              type: entry.type,
              category: entry.category,
              configurable: entry.configurable ?? true,
              internal: entry.internal ?? false,
              description: entry.description,
              filePath: `component://${entry.type}`,
              propCount: entry.props?.length ?? 0,
            }))
        },
      }
    },
  }
}
