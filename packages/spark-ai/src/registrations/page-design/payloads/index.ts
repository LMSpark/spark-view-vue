export {
  SPARK_COMPONENT_PAYLOAD_DESCRIPTION,
  SPARK_COMPONENT_PAYLOAD_REF,
  guidePageDesignComponentPayload,
  queryPageDesignComponentPayloads,
} from './component-payload-catalog'

import {
  COMPONENT_CATALOG_JSON,
  RAW_COMPONENT_CATALOG_JSON,
} from './component-catalog-source'

export { COMPONENT_CATALOG_JSON, RAW_COMPONENT_CATALOG_JSON }

export {
  projectFrameworkNeutralCatalog,
  projectComponentDirectory,
  projectComponentSpec,
  projectComponentConfigGuide,
  projectFunctionCatalog,
  projectHydratedComponent,
} from './catalog-projections'

export { queryComponentCatalog } from './catalog-query'
export type { ComponentCatalogQueryOptions, ComponentCatalogQuerySource } from './catalog-query'

export type {
  ComponentDirectoryPayload,
  ComponentSpec,
  ComponentConfigGuide,
  HydratedComponentEntry,
  HydratedPropEntry,
  HydratedEmitEntry,
} from './catalog-projections'

export type {
  RawComponentCatalog,
  RawComponentEntry,
  ComponentCatalog,
  ComponentEntry,
  ComponentRegistry,
  PropEntry,
  PropSchema,
  PropSchemaProperty,
  EmitEntry,
  RootFieldEntry,
  CatalogBindingDescriptor,
} from './types'

export type {
  FunctionCatalog,
  FunctionCatalogRegistry,
  FunctionComponentEntry,
  FunctionPropEntry,
} from './function-catalog-types'
