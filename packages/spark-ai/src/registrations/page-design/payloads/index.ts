export {
  SPARK_COMPONENT_PAYLOAD_DESCRIPTION,
  SPARK_COMPONENT_PAYLOAD_REF,
  guidePageDesignComponentPayload,
  queryPageDesignComponentPayloads,
} from './component-payload-catalog'

import rawComponentCatalogJson from './component-catalog.json'
import { projectFrameworkNeutralCatalog } from './catalog-projections'
import type { ComponentCatalog } from './types'

export const COMPONENT_CATALOG_JSON = projectFrameworkNeutralCatalog(rawComponentCatalogJson as ComponentCatalog)

export {
  projectFrameworkNeutralCatalog,
  projectComponentDirectory,
  projectComponentSpec,
  projectComponentConfigGuide,
  projectFunctionCatalog,
  projectHydratedComponent,
} from './catalog-projections'

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
  EmitEntry,
  PlatformConstraints,
  NestingRule,
  RootFieldEntry,
  CatalogBindingDescriptor,
  SharedTypeDefinition,
} from './types'

export type {
  FunctionCatalog,
  FunctionCatalogRegistry,
  FunctionComponentEntry,
  FunctionPropEntry,
} from './function-catalog-types'
