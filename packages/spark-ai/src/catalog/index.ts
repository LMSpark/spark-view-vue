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
  projectDevTypes,
  projectDevPropNames,
  projectDevPropEnums,
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

export {
  DEV_TYPES,
  DEV_PROP_NAMES,
  DEV_PROP_ENUMS,
  DEV_TYPE_LABELS,
  DEV_REQUIRED_PROPS,
} from './catalog-dev-exports'

export type {
  FunctionCatalog,
  FunctionCatalogRegistry,
  FunctionComponentEntry,
  FunctionPropEntry,
} from './function-catalog-types'
